/*
 * tools/render.c — yaolin 博客静态渲染器
 * ============================================================================
 * 把 posts/ 里的 Markdown 文章渲染成可以直接托管的静态网页：
 *
 *     posts/ 里的 .md/.txt  ──►  p-<id>.html   每篇文章一个完整页面
 *                           ──►  posts.json    文章清单（无目录列表时首页靠它列出文章）
 *
 * 设计原则：**与站点前端行为保持一致**。本程序的解析规则是 js/store.js 的
 * parseMdFile()、js/markdown.js 的 renderMarkdown()/plainText()/readingMinutes()、
 * 以及 js/store.js 的 coverFor() 的等价实现，所以静态页和 post.html?id= 的
 * 客户端渲染结果一致：
 *
 *   - front matter：key: value，tags 支持 [a, b] 写法
 *   - Markdown：标题 / 加粗 / 斜体 / 删除线 / 行内代码 / 围栏代码块 /
 *               有序无序列表 / 引用 / 分隔线 / 链接 / 图片
 *   - 摘要：没有 summary 就用正文自动摘要（96 个 UTF-16 单元）
 *   - 阅读时长：中文 400 字/分 + 英文 180 词/分，至少 1 分钟
 *   - 封面：对文章 id 做 hash 后从 js/store.js 的 COVERS 里取（运行时解析，
 *           不复制那份壁纸列表，避免和前端漂移）
 *   - 页面外壳（导航 / 看板娘 / 播放器 / 页脚）：运行时从 post.html 里截取，
 *           所以改 post.html 后重新渲染即可，不需要改本程序
 *
 * 注意：文章页放在站点根目录（与 index.html 同级），因为看板娘和播放器用的是
 * 相对路径（l2d/…、music/…），只有同层才能正常工作。
 *
 * 用法：
 *     make            # 编译（tools/render）
 *     make render     # 渲染
 *     make check      # 只检查是否过期，过期则退出码 1
 *     make prune      # 删除已删文章的旧静态页
 * ============================================================================
 */

#define _POSIX_C_SOURCE 200809L

#include <ctype.h>
#include <dirent.h>
#include <errno.h>
#include <math.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define GENERATED_MARK "<!-- 由 tools/render.c 生成，请勿手改；改文章请改 posts/ 里的源文件 -->"

/* ============================== 基础工具 ============================== */

static const char *g_prog = "render";
static int g_quiet = 0;

static void die(const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  fprintf(stderr, "%s: ", g_prog);
  vfprintf(stderr, fmt, ap);
  fputc('\n', stderr);
  va_end(ap);
  exit(1);
}

static void *xmalloc(size_t n) {
  void *p = malloc(n ? n : 1);
  if (!p) die("内存不足");
  return p;
}

static char *xstrndup(const char *s, size_t n) {
  char *p = xmalloc(n + 1);
  memcpy(p, s, n);
  p[n] = '\0';
  return p;
}

/* 可增长的字符串缓冲（始终以 '\0' 结尾） */
typedef struct {
  char  *s;
  size_t n, cap;
} Buf;

static void buf_reserve(Buf *b, size_t extra) {
  if (b->n + extra + 1 <= b->cap) return;
  size_t cap = b->cap ? b->cap : 128;
  while (cap < b->n + extra + 1) cap *= 2;
  b->s = realloc(b->s, cap);
  if (!b->s) die("内存不足");
  b->cap = cap;
}

static void buf_init(Buf *b) { b->s = NULL; b->n = 0; b->cap = 0; buf_reserve(b, 0); b->s[0] = '\0'; }
static void buf_free(Buf *b) { free(b->s); b->s = NULL; b->n = 0; b->cap = 0; }
static void buf_putc(Buf *b, int c) { buf_reserve(b, 1); b->s[b->n++] = (char)c; b->s[b->n] = '\0'; }
static void buf_putn(Buf *b, const char *p, size_t n) {
  if (!n) return;
  buf_reserve(b, n);
  memcpy(b->s + b->n, p, n);
  b->n += n;
  b->s[b->n] = '\0';
}
static void buf_puts(Buf *b, const char *s) { buf_putn(b, s, strlen(s)); }

static void buf_printf(Buf *b, const char *fmt, ...) {
  va_list ap, ap2;
  va_start(ap, fmt);
  va_copy(ap2, ap);
  int need = vsnprintf(NULL, 0, fmt, ap);
  va_end(ap);
  if (need < 0) die("vsnprintf 失败");
  buf_reserve(b, (size_t)need);
  vsnprintf(b->s + b->n, (size_t)need + 1, fmt, ap2);
  va_end(ap2);
  b->n += (size_t)need;
}

/* 字符串数组 */
typedef struct {
  char **v;
  size_t n, cap;
} StrList;

static void sl_push_n(StrList *l, const char *s, size_t n) {
  if (l->n == l->cap) {
    l->cap = l->cap ? l->cap * 2 : 8;
    l->v = realloc(l->v, l->cap * sizeof *l->v);
    if (!l->v) die("内存不足");
  }
  l->v[l->n++] = xstrndup(s, n);
}
static void sl_push(StrList *l, const char *s) { sl_push_n(l, s, strlen(s)); }
static void sl_free(StrList *l) {
  for (size_t i = 0; i < l->n; i++) free(l->v[i]);
  free(l->v);
  l->v = NULL;
  l->n = l->cap = 0;
}

/* 读整个文件；失败返回 NULL */
static char *read_file(const char *path, size_t *len_out) {
  FILE *f = fopen(path, "rb");
  if (!f) return NULL;
  Buf b;
  buf_init(&b);
  char tmp[8192];
  size_t got;
  while ((got = fread(tmp, 1, sizeof tmp, f)) > 0) buf_putn(&b, tmp, got);
  fclose(f);
  if (len_out) *len_out = b.n;
  return b.s;
}

/* 内容有变化才写盘，返回 0 成功；*changed 标记是否真的重写了 */
static int write_if_changed(const char *path, const char *data, size_t len, int *changed) {
  size_t old = 0;
  char *prev = read_file(path, &old);
  if (prev && old == len && memcmp(prev, data, len) == 0) {
    free(prev);
    if (changed) *changed = 0;
    return 0;
  }
  free(prev);
  FILE *f = fopen(path, "wb");
  if (!f) {
    fprintf(stderr, "%s: 无法写入 %s: %s\n", g_prog, path, strerror(errno));
    return -1;
  }
  if (len && fwrite(data, 1, len, f) != len) {
    fclose(f);
    fprintf(stderr, "%s: 写入 %s 失败\n", g_prog, path);
    return -1;
  }
  fclose(f);
  if (changed) *changed = 1;
  return 0;
}

/* ============================== UTF-8 ============================== */

static size_t utf8_decode(const char *s, uint32_t *cp) {
  const unsigned char *u = (const unsigned char *)s;
  if (u[0] < 0x80) { *cp = u[0]; return 1; }
  if ((u[0] & 0xE0) == 0xC0 && (u[1] & 0xC0) == 0x80) {
    *cp = (uint32_t)(((u[0] & 0x1Fu) << 6) | (u[1] & 0x3Fu));
    return 2;
  }
  if ((u[0] & 0xF0) == 0xE0 && (u[1] & 0xC0) == 0x80 && (u[2] & 0xC0) == 0x80) {
    *cp = (uint32_t)(((u[0] & 0x0Fu) << 12) | ((u[1] & 0x3Fu) << 6) | (u[2] & 0x3Fu));
    return 3;
  }
  if ((u[0] & 0xF8) == 0xF0 && (u[1] & 0xC0) == 0x80 && (u[2] & 0xC0) == 0x80 && (u[3] & 0xC0) == 0x80) {
    *cp = (uint32_t)(((u[0] & 0x07u) << 18) | ((u[1] & 0x3Fu) << 12) |
                     ((u[2] & 0x3Fu) << 6) | (u[3] & 0x3Fu));
    return 4;
  }
  *cp = u[0];
  return 1;
}

/* JS 的 String.length / slice 按 UTF-16 单元算，这里保持一致 */
static size_t utf16_len(const char *s) {
  size_t n = 0;
  for (const char *p = s; *p;) {
    uint32_t cp;
    p += utf8_decode(p, &cp);
    n += (cp < 0x10000) ? 1 : 2;
  }
  return n;
}

/* 按 UTF-16 单元截断（不切开代理对），返回新字符串 */
static char *utf16_truncate(const char *s, size_t max_units) {
  Buf b;
  buf_init(&b);
  size_t used = 0;
  for (const char *p = s; *p;) {
    uint32_t cp;
    size_t adv = utf8_decode(p, &cp);
    size_t u = (cp < 0x10000) ? 1 : 2;
    if (used + u > max_units) break;
    buf_putn(&b, p, adv);
    used += u;
    p += adv;
  }
  return b.s;
}

static int is_cjk(uint32_t cp) { return cp >= 0x4E00u && cp <= 0x9FA5u; }

/* ============================== HTML 转义 ============================== */
/* 等价于 js/markdown.js 的 escapeHtml（顺序也是 & 优先） */
static void buf_escape_html(Buf *b, const char *s) {
  for (const char *p = s; *p; p++) {
    switch (*p) {
      case '&': buf_puts(b, "&amp;"); break;
      case '<': buf_puts(b, "&lt;"); break;
      case '>': buf_puts(b, "&gt;"); break;
      case '"': buf_puts(b, "&quot;"); break;
      default: buf_putc(b, (unsigned char)*p); break;
    }
  }
}

/* 把一段 HTML 还原成纯文本（等价于 DOM 的 textContent，用于目录标题） */
static void html_to_text(const char *html, Buf *out) {
  for (const char *p = html; *p;) {
    if (*p == '<') {
      const char *q = strchr(p, '>');
      if (!q) break;
      p = q + 1;
      continue;
    }
    if (*p == '&') {
      if (!strncmp(p, "&amp;", 5)) { buf_putc(out, '&'); p += 5; continue; }
      if (!strncmp(p, "&lt;", 4)) { buf_putc(out, '<'); p += 4; continue; }
      if (!strncmp(p, "&gt;", 4)) { buf_putc(out, '>'); p += 4; continue; }
      if (!strncmp(p, "&quot;", 6)) { buf_putc(out, '"'); p += 6; continue; }
    }
    buf_putc(out, *p++);
  }
}

/* ========================= 行内 Markdown（inline()） ========================= */
/* 严格按 js/markdown.js 的顺序：先保护行内代码，然后加粗 → 斜体 → 删除线 →
   图片 → 链接，最后还原行内代码。所有替换都是全局的，且不回扫替换结果。 */

typedef size_t (*MatchFn)(const char *s, void *ud);
typedef void (*ReplFn)(Buf *out, const char *s, size_t mlen, void *ud);

static void subst_all(Buf *b, MatchFn mf, ReplFn rf, void *ud) {
  const char *s = b->s;
  size_t n = b->n, i = 0;
  Buf out;
  buf_init(&out);
  while (i < n) {
    size_t ml = mf(s + i, ud);
    if (ml > 0) {
      rf(&out, s + i, ml, ud);
      i += ml;
    } else {
      buf_putc(&out, s[i]);
      i++;
    }
  }
  buf_free(b);
  *b = out;
}

/* 行内代码 → 占位符（用 \x01 数字 \x01，正文里不会出现 \x01） */
static void replace_code_spans(Buf *b, StrList *store) {
  const char *s = b->s;
  size_t n = b->n, i = 0;
  Buf out;
  buf_init(&out);
  while (i < n) {
    if (s[i] == '`') {
      size_t j = i + 1;
      while (j < n && s[j] != '`') j++;
      if (j < n && j > i + 1) { /* [^`]+ 至少一个字符 */
        sl_push_n(store, s + i + 1, j - i - 1);
        buf_printf(&out, "\x01%lu\x01", (unsigned long)(store->n - 1));
        i = j + 1;
        continue;
      }
    }
    buf_putc(&out, s[i]);
    i++;
  }
  buf_free(b);
  *b = out;
}

static void restore_code_spans(Buf *b, StrList *store) {
  const char *s = b->s;
  size_t n = b->n, i = 0;
  Buf out;
  buf_init(&out);
  while (i < n) {
    if (s[i] == '\x01') {
      size_t j = i + 1, idx = 0;
      int any = 0;
      while (j < n && isdigit((unsigned char)s[j])) {
        idx = idx * 10 + (size_t)(s[j] - '0');
        j++;
        any = 1;
      }
      if (any && j < n && s[j] == '\x01' && idx < store->n) {
        buf_puts(&out, "<code>");
        buf_puts(&out, store->v[idx]);
        buf_puts(&out, "</code>");
        i = j + 1;
        continue;
      }
    }
    buf_putc(&out, s[i]);
    i++;
  }
  buf_free(b);
  *b = out;
}

/* **x** 与 ~~x~~：两字符定界，内部不含定界字符 */
typedef struct {
  const char *open, *pre, *post;
} PairCtx;

static size_t match_pair2(const char *s, void *ud) {
  PairCtx *c = ud;
  char d = c->open[0];
  if (s[0] != d || s[1] != d) return 0;
  if (!s[2] || s[2] == d) return 0; /* 内部非空且不含定界字符 */
  const char *e = s + 2;
  while (*e && *e != d) e++;
  if (*e != d || e[1] != d) return 0;
  return (size_t)(e - s) + 2;
}

static void repl_pair2(Buf *out, const char *s, size_t mlen, void *ud) {
  PairCtx *c = ud;
  buf_puts(out, c->pre);
  buf_putn(out, s + 2, mlen - 4);
  buf_puts(out, c->post);
}

/* *x* */
static size_t match_italic(const char *s, void *ud) {
  (void)ud;
  if (s[0] != '*') return 0;
  if (!s[1] || s[1] == '*') return 0;
  const char *e = s + 1;
  while (*e && *e != '*') e++;
  if (*e != '*') return 0;
  return (size_t)(e - s) + 1;
}

static void repl_italic(Buf *out, const char *s, size_t mlen, void *ud) {
  (void)ud;
  buf_puts(out, "<em>");
  buf_putn(out, s + 1, mlen - 2);
  buf_puts(out, "</em>");
}

/* ![alt](url) */
static size_t match_image(const char *s, void *ud) {
  (void)ud;
  if (s[0] != '!' || s[1] != '[') return 0;
  const char *e = s + 2;
  while (*e && *e != ']') e++;
  if (*e != ']' || e[1] != '(') return 0;
  const char *f = e + 2;
  while (*f && *f != ')') f++;
  if (*f != ')' || f == e + 2) return 0; /* url 非空 */
  return (size_t)(f - s) + 1;
}

static void repl_image(Buf *out, const char *s, size_t mlen, void *ud) {
  (void)ud;
  const char *e = s + 2;
  while (*e != ']') e++;
  const char *end = s + mlen - 1; /* ')' */
  buf_puts(out, "<img src=\"");
  buf_putn(out, e + 2, (size_t)(end - (e + 2)));
  buf_puts(out, "\" alt=\"");
  buf_putn(out, s + 2, (size_t)(e - (s + 2)));
  buf_puts(out, "\" loading=\"lazy\">");
}

/* [text](url) */
static size_t match_link(const char *s, void *ud) {
  (void)ud;
  if (s[0] != '[') return 0;
  const char *e = s + 1;
  while (*e && *e != ']') e++;
  if (*e != ']' || e == s + 1 || e[1] != '(') return 0; /* 文本非空 */
  const char *f = e + 2;
  while (*f && *f != ')') f++;
  if (*f != ')' || f == e + 2) return 0;
  return (size_t)(f - s) + 1;
}

static void repl_link(Buf *out, const char *s, size_t mlen, void *ud) {
  (void)ud;
  const char *e = s + 1;
  while (*e != ']') e++;
  const char *end = s + mlen - 1;
  buf_puts(out, "<a href=\"");
  buf_putn(out, e + 2, (size_t)(end - (e + 2)));
  buf_puts(out, "\" target=\"_blank\" rel=\"noopener\">");
  buf_putn(out, s + 1, (size_t)(e - (s + 1)));
  buf_puts(out, "</a>");
}

static void inline_fmt(Buf *out, const char *src) {
  Buf t;
  buf_init(&t);
  buf_puts(&t, src);

  StrList codes = {0};
  replace_code_spans(&t, &codes);

  PairCtx bold = {"**", "<strong>", "</strong>"};
  PairCtx del = {"~~", "<del>", "</del>"};
  subst_all(&t, match_pair2, repl_pair2, &bold);
  subst_all(&t, match_italic, repl_italic, NULL);
  subst_all(&t, match_pair2, repl_pair2, &del);
  subst_all(&t, match_image, repl_image, NULL);
  subst_all(&t, match_link, repl_link, NULL);

  restore_code_spans(&t, &codes);

  buf_puts(out, t.s);
  buf_free(&t);
  sl_free(&codes);
}

/* ===================== 块级 Markdown（renderMarkdown()） ===================== */

typedef struct {
  int   level;
  char *html;
} Heading;

typedef struct {
  Heading *v;
  size_t   n, cap;
} HeadList;

static void hl_push(HeadList *l, int level, const char *html) {
  if (l->n == l->cap) {
    l->cap = l->cap ? l->cap * 2 : 8;
    l->v = realloc(l->v, l->cap * sizeof *l->v);
    if (!l->v) die("内存不足");
  }
  l->v[l->n].level = level;
  l->v[l->n].html = xstrndup(html, strlen(html));
  l->n++;
}

static void hl_free(HeadList *l) {
  for (size_t i = 0; i < l->n; i++) free(l->v[i].html);
  free(l->v);
  l->v = NULL;
  l->n = l->cap = 0;
}

static int line_is_blank(const char *s) {
  for (; *s; s++)
    if (!isspace((unsigned char)*s)) return 0;
  return 1;
}

static void emit_code_block(Buf *out, const Buf *lang, const Buf *code) {
  buf_puts(out, "<pre><code class=\"lang-");
  buf_puts(out, lang->n ? lang->s : "text");
  buf_puts(out, "\">");
  buf_puts(out, code->n ? code->s : "");
  buf_puts(out, "</code></pre>");
}

static void render_markdown(const char *md, Buf *out, HeadList *heads) {
  int list_type = 0; /* 0 无 / 1 ul / 2 ol */
  int in_quote = 0, in_code = 0;
  Buf lang, code;
  buf_init(&lang);
  buf_init(&code);

#define CLOSE_LIST()                                                  \
  do {                                                                \
    if (list_type) {                                                  \
      buf_puts(out, list_type == 1 ? "</ul>" : "</ol>");              \
      list_type = 0;                                                  \
    }                                                                 \
  } while (0)
#define CLOSE_QUOTE()                                                 \
  do {                                                                \
    if (in_quote) {                                                   \
      buf_puts(out, "</blockquote>");                                 \
      in_quote = 0;                                                   \
    }                                                                 \
  } while (0)

  const char *cur = md;
  for (;;) {
    const char *nl = strchr(cur, '\n');
    size_t len = nl ? (size_t)(nl - cur) : strlen(cur);
    if (len && cur[len - 1] == '\r') len--;
    char *raw = xstrndup(cur, len);

    /* 围栏代码块：在转义之前判断（与原实现一致） */
    if (raw[0] && raw[1] && raw[2] &&
        ((raw[0] == '`' && raw[1] == '`' && raw[2] == '`') ||
         (raw[0] == '~' && raw[1] == '~' && raw[2] == '~'))) {
      if (!in_code) {
        CLOSE_LIST();
        CLOSE_QUOTE();
        in_code = 1;
        buf_free(&lang);
        buf_init(&lang);
        const char *t = raw + 3;
        while (*t == ' ' || *t == '\t') t++;
        size_t tl = strlen(t);
        while (tl && isspace((unsigned char)t[tl - 1])) tl--;
        buf_putn(&lang, t, tl);
        buf_free(&code);
        buf_init(&code);
      } else {
        in_code = 0;
        emit_code_block(out, &lang, &code);
        buf_free(&lang);
        buf_init(&lang);
        buf_free(&code);
        buf_init(&code);
      }
      free(raw);
      if (!nl) break;
      cur = nl + 1;
      continue;
    }

    if (in_code) {
      /* 原实现：codeBuf.push(escapeHtml(raw)) 后用 \n 连接 */
      if (code.n) buf_putc(&code, '\n');
      buf_escape_html(&code, raw);
      free(raw);
      if (!nl) break;
      cur = nl + 1;
      continue;
    }

    Buf line;
    buf_init(&line);
    buf_escape_html(&line, raw);
    free(raw);

    if (line_is_blank(line.s)) {
      CLOSE_LIST();
      CLOSE_QUOTE();
      buf_free(&line);
      if (!nl) break;
      cur = nl + 1;
      continue;
    }

    /* 标题 */
    int hashes = 0;
    while (line.s[hashes] == '#') hashes++;
    if (hashes >= 1 && hashes <= 6 && line.s[hashes] &&
        isspace((unsigned char)line.s[hashes])) {
      const char *txt = line.s + hashes;
      while (*txt && isspace((unsigned char)*txt)) txt++;
      CLOSE_LIST();
      CLOSE_QUOTE();
      Buf inner;
      buf_init(&inner);
      inline_fmt(&inner, txt);
      if (hashes == 2 || hashes == 3) {
        size_t sec = heads->n;
        hl_push(heads, hashes, inner.s);
        buf_printf(out, "<h%d id=\"sec-%lu\">", hashes, (unsigned long)sec);
      } else {
        buf_printf(out, "<h%d>", hashes);
      }
      buf_puts(out, inner.s);
      buf_printf(out, "</h%d>", hashes);
      buf_free(&inner);
      buf_free(&line);
      if (!nl) break;
      cur = nl + 1;
      continue;
    }

    /* 分隔线 --- 或 *** */
    {
      char c = line.s[0];
      if (c == '-' || c == '*') {
        size_t k = 0;
        while (line.s[k] == c) k++;
        if (k >= 3 && line.s[k] == '\0') {
          CLOSE_LIST();
          CLOSE_QUOTE();
          buf_puts(out, "<hr>");
          buf_free(&line);
          if (!nl) break;
          cur = nl + 1;
          continue;
        }
      }
    }

    /* 引用（转义后的行以 &gt; 开头） */
    if (!strncmp(line.s, "&gt;", 4)) {
      CLOSE_LIST();
      if (!in_quote) {
        in_quote = 1;
        buf_puts(out, "<blockquote>");
      }
      const char *txt = line.s + 4;
      if (*txt == ' ' || *txt == '\t') txt++; /* \s? 只吃掉一个 */
      buf_puts(out, "<p>");
      inline_fmt(out, txt);
      buf_puts(out, "</p>");
      buf_free(&line);
      if (!nl) break;
      cur = nl + 1;
      continue;
    }
    CLOSE_QUOTE();

    /* 列表 */
    {
      const char *p = line.s;
      while (*p == ' ' || *p == '\t') p++;
      int t = 0;
      const char *txt = NULL;
      if ((*p == '-' || *p == '*' || *p == '+') && (p[1] == ' ' || p[1] == '\t')) {
        t = 1;
        txt = p + 1;
      } else if (isdigit((unsigned char)*p)) {
        const char *q = p;
        while (isdigit((unsigned char)*q)) q++;
        if ((*q == '.' || *q == ')') && (q[1] == ' ' || q[1] == '\t')) {
          t = 2;
          txt = q + 1;
        }
      }
      if (t) {
        while (*txt == ' ' || *txt == '\t') txt++;
        if (list_type != t) {
          CLOSE_LIST();
          list_type = t;
          buf_puts(out, t == 1 ? "<ul>" : "<ol>");
        }
        buf_puts(out, "<li>");
        inline_fmt(out, txt);
        buf_puts(out, "</li>");
        buf_free(&line);
        if (!nl) break;
        cur = nl + 1;
        continue;
      }
    }
    CLOSE_LIST();

    /* 普通段落 */
    buf_puts(out, "<p>");
    inline_fmt(out, line.s);
    buf_puts(out, "</p>");
    buf_free(&line);
    if (!nl) break;
    cur = nl + 1;
  }

  CLOSE_LIST();
  CLOSE_QUOTE();
  if (in_code) {
    emit_code_block(out, &lang, &code);
  }
  buf_free(&lang);
  buf_free(&code);

#undef CLOSE_LIST
#undef CLOSE_QUOTE
}

/* ================= 摘要 / 阅读时长（plainText 等价的近似实现） ================= */

static void strip_images(Buf *b) {
  const char *s = b->s;
  size_t n = b->n, i = 0;
  Buf out;
  buf_init(&out);
  while (i < n) {
    size_t ml = match_image(s + i, NULL);
    if (ml > 0) {
      i += ml;
      continue;
    }
    buf_putc(&out, s[i]);
    i++;
  }
  buf_free(b);
  *b = out;
}

static void links_to_text(Buf *b) {
  const char *s = b->s;
  size_t n = b->n, i = 0;
  Buf out;
  buf_init(&out);
  while (i < n) {
    size_t ml = match_link(s + i, NULL);
    if (ml > 0) {
      const char *e = s + i + 1;
      while (*e != ']') e++;
      buf_putn(&out, s + i + 1, (size_t)(e - (s + i + 1)));
      i += ml;
      continue;
    }
    buf_putc(&out, s[i]);
    i++;
  }
  buf_free(b);
  *b = out;
}

/* 等价于 plainText()：去代码块/图片，链接留文字，去标记字符，压缩空白 */
static void plain_text(const char *md, Buf *out) {
  Buf t;
  buf_init(&t);

  /* 行处理：跳过整行的裸围栏代码块，去掉行首 # / > 标记 */
  int in_fence = 0;
  const char *cur = md;
  for (;;) {
    const char *nl = strchr(cur, '\n');
    size_t len = nl ? (size_t)(nl - cur) : strlen(cur);
    while (len && (cur[len - 1] == '\r')) len--;
    char *line = xstrndup(cur, len);

    int bare_fence = (!strcmp(line, "```") || !strcmp(line, "~~~"));
    if (bare_fence) {
      in_fence = !in_fence;
      free(line);
      if (!nl) break;
      cur = nl + 1;
      continue;
    }
    if (!in_fence) {
      const char *p = line;
      int hashes = 0;
      while (p[hashes] == '#') hashes++;
      if (hashes >= 1 && hashes <= 6 && isspace((unsigned char)p[hashes])) {
        p += hashes;
        while (*p == ' ' || *p == '\t') p++;
      } else if (p[0] == '>') {
        p++;
        if (*p == ' ' || *p == '\t') p++;
      }
      buf_puts(&t, p);
      buf_putc(&t, '\n');
    }
    free(line);
    if (!nl) break;
    cur = nl + 1;
  }

  strip_images(&t);
  links_to_text(&t);

  for (size_t i = 0; i < t.n; i++) {
    char c = t.s[i];
    if (c == '*' || c == '_' || c == '~' || c == '`' || c == '#' || c == '>' || c == '-')
      t.s[i] = ' ';
  }

  /* \s+ → 单个空格，然后 trim */
  Buf norm;
  buf_init(&norm);
  int pending_space = 0;
  for (size_t i = 0; i < t.n; i++) {
    if (isspace((unsigned char)t.s[i])) {
      pending_space = 1;
      continue;
    }
    if (pending_space && norm.n) buf_putc(&norm, ' ');
    pending_space = 0;
    buf_putc(&norm, t.s[i]);
  }
  buf_free(&t);
  buf_puts(out, norm.s);
  buf_free(&norm);

  (void)in_fence;
}

/* 等价于 autoSummary(md, 96) */
static char *auto_summary(const char *md, size_t max_units) {
  Buf t;
  buf_init(&t);
  plain_text(md, &t);
  if (t.n == 0) {
    buf_free(&t);
    return xstrndup("（无摘要）", strlen("（无摘要）"));
  }
  if (utf16_len(t.s) > max_units) {
    char *cut = utf16_truncate(t.s, max_units);
    Buf r;
    buf_init(&r);
    buf_puts(&r, cut);
    buf_puts(&r, "…");
    free(cut);
    buf_free(&t);
    return r.s;
  }
  return t.s;
}

/* 等价于 readingMinutes() */
static int reading_minutes(const char *content) {
  size_t cjk = 0, words = 0;
  int in_word = 0;
  for (const char *p = content; *p;) {
    uint32_t cp;
    p += utf8_decode(p, &cp);
    if (is_cjk(cp)) cjk++;
    int alnum = (cp < 128 && isalnum((int)cp));
    if (alnum) {
      if (!in_word) {
        words++;
        in_word = 1;
      }
    } else {
      in_word = 0;
    }
  }
  double v = (double)cjk / 400.0 + (double)words / 180.0;
  int m = (int)ceil(v);
  return m < 1 ? 1 : m;
}

/* ========================= front matter（parseMdFile） ========================= */

typedef struct {
  char   *id;
  char   *title;
  char   *date;
  char   *summary;
  char   *content;
  StrList tags;
} Post;

static void post_free(Post *p) {
  free(p->id);
  free(p->title);
  free(p->date);
  free(p->summary);
  free(p->content);
  sl_free(&p->tags);
  memset(p, 0, sizeof *p);
}

/* key 允许 [A-Za-z0-9_] 与中日韩汉字 */
static int is_key_char(uint32_t cp) {
  return (cp < 128 && (isalnum((int)cp) || cp == '_')) || is_cjk(cp);
}

static char *trim_dup(const char *s) {
  while (*s && isspace((unsigned char)*s)) s++;
  size_t n = strlen(s);
  while (n && isspace((unsigned char)s[n - 1])) n--;
  return xstrndup(s, n);
}

/* 去首尾各一个双引号（等价于 replace(/^"|"$/g, "")） */
static char *strip_quotes_dup(const char *s) {
  size_t n = strlen(s);
  if (n && s[0] == '"') {
    s++;
    n--;
  }
  if (n && s[n - 1] == '"') n--;
  return xstrndup(s, n);
}

static char *basename_stem(const char *name) {
  size_t n = strlen(name);
  if (n > 3 && name[n - 3] == '.' &&
      (tolower((unsigned char)name[n - 2]) == 'm') && tolower((unsigned char)name[n - 1]) == 'd')
    n -= 3;
  else if (n > 4 && name[n - 4] == '.' && tolower((unsigned char)name[n - 3]) == 't' &&
           tolower((unsigned char)name[n - 2]) == 'x' && tolower((unsigned char)name[n - 1]) == 't')
    n -= 4;
  return xstrndup(name, n);
}

static Post parse_md_file(const char *name, const char *text) {
  Post p;
  memset(&p, 0, sizeof p);
  p.id = basename_stem(name);

  const char *body = text;
  static const char *FM_OPEN = "---";
  size_t tlen = strlen(text);

  int has_front = 0;
  const char *fm_start = NULL, *fm_end = NULL;
  if (tlen >= 3 && !strncmp(text, FM_OPEN, 3)) {
    const char *p2 = text + 3;
    while (*p2 == ' ' || *p2 == '\t' || *p2 == '\r') p2++;
    if (*p2 == '\n') {
      fm_start = p2 + 1;
      /* 找第一个以 "---" 开头的行作为结束 */
      const char *scan = fm_start;
      while (scan && *scan) {
        const char *line_start = scan;
        const char *nl = strchr(scan, '\n');
        size_t llen = nl ? (size_t)(nl - scan) : strlen(scan);
        while (llen && line_start[llen - 1] == '\r') llen--;
        if (llen >= 3 && !strncmp(line_start, "---", 3)) {
          size_t k = 3;
          while (k < llen && (line_start[k] == ' ' || line_start[k] == '\t')) k++;
          if (k == llen) {
            fm_end = line_start;
            const char *after = line_start + llen;
            if (after < text + tlen && *after == '\n') after++;
            body = after;
            has_front = 1;
            break;
          }
        }
        if (!nl) break;
        scan = nl + 1;
      }
    }
  }

  if (has_front && fm_end && fm_end >= fm_start) {
    char *front = xstrndup(fm_start, (size_t)(fm_end - fm_start));
    char *walk = front;
    while (*walk) {
      char *nl = strchr(walk, '\n');
      size_t llen = nl ? (size_t)(nl - walk) : strlen(walk);
      char *line = xstrndup(walk, llen);
      size_t ln = strlen(line);
      while (ln && (line[ln - 1] == '\r')) line[--ln] = '\0';

      /* ^([\w一-龥]+)\s*:\s*(.*)$ */
      const char *q = line;
      while (*q) {
        uint32_t cp;
        size_t adv = utf8_decode(q, &cp);
        if (!is_key_char(cp)) break;
        q += adv;
      }
      if (q != line) {
        const char *r = q;
        while (*r == ' ' || *r == '\t') r++;
        if (*r == ':') {
          r++;
          while (*r == ' ' || *r == '\t') r++;
          char *key = xstrndup(line, (size_t)(q - line));
          char *val = trim_dup(r);
          if (!strcmp(key, "title")) {
            free(p.title);
            p.title = strip_quotes_dup(val);
          } else if (!strcmp(key, "date")) {
            free(p.date);
            p.date = strip_quotes_dup(val);
          } else if (!strcmp(key, "summary")) {
            free(p.summary);
            p.summary = strip_quotes_dup(val);
          } else if (!strcmp(key, "tags")) {
            size_t vn = strlen(val);
            if (vn >= 2 && val[0] == '[' && val[vn - 1] == ']') {
              char *inner = xstrndup(val + 1, vn - 2);
              char *tok = inner;
              while (*tok) {
                char *comma = strchr(tok, ',');
                size_t tn = comma ? (size_t)(comma - tok) : strlen(tok);
                char *item = trim_dup(xstrndup(tok, tn));
                char *clean = strip_quotes_dup(item);
                if (*clean) sl_push(&p.tags, clean);
                free(clean);
                free(item);
                if (!comma) break;
                tok = comma + 1;
              }
              free(inner);
            } else {
              char *clean = strip_quotes_dup(val);
              if (*clean) sl_push(&p.tags, clean);
              free(clean);
            }
          }
          free(key);
          free(val);
        }
      }
      free(line);
      if (!nl) break;
      walk = nl + 1;
    }
    free(front);
  }

  /* 正文 trim */
  {
    const char *b = body;
    while (*b && isspace((unsigned char)*b)) b++;
    size_t n = strlen(b);
    while (n && isspace((unsigned char)b[n - 1])) n--;
    p.content = xstrndup(b, n);
  }

  if (!p.title) {
    /* 正文第一个 "# 标题" */
    const char *scan = body;
    char *found = NULL;
    while (*scan) {
      const char *nl = strchr(scan, '\n');
      size_t llen = nl ? (size_t)(nl - scan) : strlen(scan);
      if (llen >= 3 && scan[0] == '#' && (scan[1] == ' ' || scan[1] == '\t')) {
        const char *t = scan + 1;
        while (*t == ' ' || *t == '\t') t++;
        size_t tn = (size_t)((scan + llen) - t);
        while (tn && isspace((unsigned char)t[tn - 1])) tn--;
        found = xstrndup(t, tn);
        break;
      }
      if (!nl) break;
      scan = nl + 1;
    }
    p.title = found ? found : xstrndup(p.id, strlen(p.id));
  }

  if (!p.date) {
    time_t now = time(NULL);
    struct tm tmv;
    localtime_r(&now, &tmv);
    char buf[32];
    snprintf(buf, sizeof buf, "%04d-%02d-%02d", tmv.tm_year + 1900, tmv.tm_mon + 1, tmv.tm_mday);
    p.date = xstrndup(buf, strlen(buf));
  }

  if (!p.summary) p.summary = auto_summary(body, 96);

  return p;
}

/* 日期比较（缺失的时间按 00:00:00；日期倒序 = 新在前） */
typedef struct {
  int y, mo, d, h, mi, s;
} DateKey;

static DateKey parse_date_key(const char *s) {
  DateKey k;
  memset(&k, 0, sizeof k);
  if (sscanf(s, "%d-%d-%d %d:%d:%d", &k.y, &k.mo, &k.d, &k.h, &k.mi, &k.s) >= 3) return k;
  memset(&k, 0, sizeof k);
  return k;
}

static int date_key_cmp(const DateKey *a, const DateKey *b) {
  if (a->y != b->y) return a->y - b->y;
  if (a->mo != b->mo) return a->mo - b->mo;
  if (a->d != b->d) return a->d - b->d;
  if (a->h != b->h) return a->h - b->h;
  if (a->mi != b->mi) return a->mi - b->mi;
  return a->s - b->s;
}

/* ========================= 封面（coverFor()） ========================= */

static uint32_t cover_hash(const char *s) {
  uint32_t h = 0;
  for (const char *p = s; *p;) {
    uint32_t cp;
    size_t adv = utf8_decode(p, &cp);
    p += adv;
    if (cp < 0x10000) {
      h = h * 31u + cp; /* uint32 回绕 = JS 的 >>> 0 */
    } else {
      uint32_t v = cp - 0x10000u;
      h = h * 31u + (0xD800u + (v >> 10));
      h = h * 31u + (0xDC00u + (v & 0x3FFu));
    }
  }
  return h;
}

/* 从 js/store.js 里解析 var COVERS = [ ... ]，避免复制那份列表 */
static StrList load_covers(const char *root) {
  StrList list = {0};
  Buf path;
  buf_init(&path);
  buf_printf(&path, "%s/js/store.js", root);
  char *src = read_file(path.s, NULL);
  buf_free(&path);
  if (!src) {
    sl_push(&list, "img/hero.jpg");
    return list;
  }
  const char *p = strstr(src, "COVERS");
  if (p) p = strchr(p, '[');
  if (p) {
    p++;
    while (*p) {
      while (*p && (isspace((unsigned char)*p) || *p == ',')) p++;
      if (*p != '"') break;
      const char *q = strchr(p + 1, '"');
      if (!q) break;
      sl_push_n(&list, p + 1, (size_t)(q - p - 1));
      p = q + 1;
    }
  }
  free(src);
  if (!list.n) sl_push(&list, "img/hero.jpg");
  return list;
}

/* ========================= 页面外壳（取自 post.html） ========================= */

/* 截取 src 里 [start_m, end_m) 或 [start_m, end_m] 之间的片段
   （inclusive=1 时把 end_m 一起带上，用于 </header> 这种收尾标签） */
static char *extract_block(const char *src, const char *start_m, const char *end_m, int inclusive) {
  const char *a = strstr(src, start_m);
  if (!a) return NULL;
  const char *b = strstr(a, end_m);
  if (!b) return NULL;
  b += inclusive ? strlen(end_m) : 0;
  return xstrndup(a, (size_t)(b - a));
}

typedef struct {
  char *header;
  char *widgets;
  char *footer;
} Chrome;

static Chrome load_chrome(const char *root) {
  Buf path;
  buf_init(&path);
  buf_printf(&path, "%s/post.html", root);
  char *src = read_file(path.s, NULL);
  if (!src) die("读不到 %s（请在站点根目录运行，或用 --root 指定）", path.s);
  buf_free(&path);

  Chrome c;
  c.header = extract_block(src, "<header class=\"ds-header-wrapper\">", "</header>", 1);
  c.widgets = extract_block(src, "<!-- 看板娘（右侧） -->", "<script src=\"js/markdown.js\"", 0);
  c.footer = extract_block(src, "<footer class=\"site-footer\">", "</footer>", 1);
  free(src);

  if (!c.header || !c.widgets || !c.footer)
    die("post.html 的结构变了：找不到导航 / 看板娘 / 页脚区块（需要更新 tools/render.c 的截取标记）");
  return c;
}

/* ========================= URL / JSON 辅助 ========================= */

/* 等价于 encodeURIComponent */
static void uri_encode(Buf *out, const char *s) {
  for (const unsigned char *p = (const unsigned char *)s; *p; p++) {
    unsigned char c = *p;
    if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '!' || c == '~' || c == '*' ||
        c == '\'' || c == '(' || c == ')')
      buf_putc(out, c);
    else
      buf_printf(out, "%%%02X", c);
  }
}

static void json_escape(Buf *out, const char *s) {
  for (const unsigned char *p = (const unsigned char *)s; *p; p++) {
    switch (*p) {
      case '"': buf_puts(out, "\\\""); break;
      case '\\': buf_puts(out, "\\\\"); break;
      case '\n': buf_puts(out, "\\n"); break;
      case '\r': buf_puts(out, "\\r"); break;
      case '\t': buf_puts(out, "\\t"); break;
      default:
        if (*p < 0x20) buf_printf(out, "\\u%04x", (unsigned)*p);
        else buf_putc(out, *p);
    }
  }
}

/* 等价于 formatDate()：2026-09-18 → 2026年9月18日 */
static char *format_date(const char *iso) {
  int y = 0, mo = 0, d = 0;
  if (sscanf(iso, "%d-%d-%d", &y, &mo, &d) < 3) return xstrndup(iso, strlen(iso));
  char buf[64];
  snprintf(buf, sizeof buf, "%d年%d月%d日", y, mo, d);
  return xstrndup(buf, strlen(buf));
}

/* 生成 p-<id>.html 的相对 URL（已百分号编码，可直接放进 href） */
static char *post_url(const char *id) {
  Buf b;
  buf_init(&b);
  buf_puts(&b, "p-");
  uri_encode(&b, id);
  buf_puts(&b, ".html");
  return b.s;
}

static void post_disk_path(Buf *out, const char *root, const char *id) {
  buf_printf(out, "%s/p-%s.html", root, id);
}

/* ========================= 组装一篇文章的页面 ========================= */

static void render_page(const Post *p, const Chrome *c, const char *cover, const Post *prev,
                        const Post *next, Buf *out) {
  Buf content_html, toc;
  buf_init(&content_html);
  buf_init(&toc);
  HeadList heads = {0};
  render_markdown(p->content, &content_html, &heads);

  buf_puts(out, "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n");
  buf_puts(out, "  <meta charset=\"UTF-8\">\n");
  buf_puts(out, "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n");
  buf_puts(out, "  <title>");
  buf_escape_html(out, p->title);
  buf_puts(out, " · yaolin 博客</title>\n");
  buf_puts(out, "  <meta name=\"description\" content=\"");
  buf_escape_html(out, p->summary);
  buf_puts(out, "\">\n");
  buf_puts(out, "  <link rel=\"stylesheet\" href=\"css/style.css\">\n");
  buf_puts(out, "  ");
  buf_puts(out, GENERATED_MARK);
  buf_puts(out, "\n</head>\n<body data-page=\"static\">\n");

  buf_puts(out, c->header);
  buf_puts(out, "\n\n  <main class=\"container post-layout\">\n");
  buf_puts(out, "    <article id=\"post-article\" class=\"post-article\">");

  buf_puts(out, "<div class=\"post-cover\"><img src=\"");
  buf_puts(out, cover);
  buf_puts(out, "\" alt=\"");
  buf_escape_html(out, p->title);
  buf_puts(out, "\"></div><header class=\"post-head\"><h1>");
  buf_escape_html(out, p->title);
  buf_puts(out, "</h1><div class=\"post-meta\"><time datetime=\"");
  buf_escape_html(out, p->date);
  buf_puts(out, "\">");
  char *fd = format_date(p->date);
  buf_puts(out, fd);
  free(fd);
  buf_printf(out, "</time><span class=\"dot\">·</span><span>%d 分钟读完</span></div>",
             reading_minutes(p->content));
  buf_puts(out, "<div class=\"card-tags\">");
  for (size_t i = 0; i < p->tags.n; i++) {
    buf_puts(out, "<span class=\"chip\">");
    buf_escape_html(out, p->tags.v[i]);
    buf_puts(out, "</span>");
  }
  buf_puts(out, "</div></header><div class=\"post-content\">");
  buf_puts(out, content_html.s);
  buf_puts(out, "</div>");

  buf_puts(out, "</article>\n");

  /* 目录：两个及以上 h2/h3 才显示（与 app.js 一致） */
  if (heads.n >= 2) {
    buf_puts(out, "    <aside id=\"post-toc\" class=\"post-toc\"><h4 class=\"toc-title\">目录</h4><ul class=\"toc-list\">");
    for (size_t i = 0; i < heads.n; i++) {
      Buf label;
      buf_init(&label);
      html_to_text(heads.v[i].html, &label);
      buf_printf(&toc, "<li class=\"toc-h%d\"><a href=\"#sec-%lu\">", heads.v[i].level,
                 (unsigned long)i);
      buf_puts(&toc, label.s);
      buf_puts(&toc, "</a></li>");
      buf_free(&label);
    }
    buf_puts(out, toc.s);
    buf_puts(out, "</ul></aside>\n");
  } else {
    buf_puts(out, "    <aside id=\"post-toc\" class=\"post-toc\" hidden></aside>\n");
  }
  buf_puts(out, "  </main>\n\n");

  /* 上一篇 / 下一篇 */
  buf_puts(out, "  <nav class=\"container post-nav\">\n");
  if (prev) {
    char *u = post_url(prev->id);
    buf_puts(out, "    <a id=\"prev-post\" class=\"post-nav-link prev\" href=\"");
    buf_puts(out, u);
    buf_puts(out, "\"><span class=\"nav-label\">上一篇</span>");
    buf_escape_html(out, prev->title);
    buf_puts(out, "</a>\n");
    free(u);
  } else {
    buf_puts(out, "    <a id=\"prev-post\" class=\"post-nav-link prev disabled\">没有了</a>\n");
  }
  buf_puts(out, "    <a href=\"index.html\" class=\"back-home\">← 返回首页</a>\n");
  if (next) {
    char *u = post_url(next->id);
    buf_puts(out, "    <a id=\"next-post\" class=\"post-nav-link next\" href=\"");
    buf_puts(out, u);
    buf_puts(out, "\"><span class=\"nav-label\">下一篇</span>");
    buf_escape_html(out, next->title);
    buf_puts(out, "</a>\n");
    free(u);
  } else {
    buf_puts(out, "    <a id=\"next-post\" class=\"post-nav-link next disabled\">没有了</a>\n");
  }
  buf_puts(out, "  </nav>\n\n");

  buf_puts(out, c->footer);
  buf_puts(out, "\n\n");
  buf_puts(out, c->widgets);
  buf_puts(out, "\n\n  <script src=\"js/store.js\"></script>\n");
  buf_puts(out, "  <script src=\"js/kanban.js\" defer></script>\n");
  buf_puts(out, "  <script src=\"js/music.js\" defer></script>\n");
  buf_puts(out, "  <script src=\"js/effects.js\" defer></script>\n");
  buf_puts(out, "</body>\n</html>\n");

  buf_free(&content_html);
  buf_free(&toc);
  hl_free(&heads);
}

/* ========================= posts.json ========================= */

static void build_manifest(const Post *posts, size_t n, Buf *out) {
  buf_puts(out, "[\n");
  for (size_t i = 0; i < n; i++) {
    const Post *p = &posts[i];
    char *url = post_url(p->id);
    buf_puts(out, "  {\n    \"id\": \"");
    json_escape(out, p->id);
    buf_puts(out, "\",\n    \"title\": \"");
    json_escape(out, p->title);
    buf_puts(out, "\",\n    \"date\": \"");
    json_escape(out, p->date);
    buf_puts(out, "\",\n    \"tags\": [");
    for (size_t t = 0; t < p->tags.n; t++) {
      if (t) buf_puts(out, ", ");
      buf_puts(out, "\"");
      json_escape(out, p->tags.v[t]);
      buf_puts(out, "\"");
    }
    buf_puts(out, "],\n    \"summary\": \"");
    json_escape(out, p->summary);
    buf_puts(out, "\",\n    \"url\": \"");
    json_escape(out, url);
    buf_puts(out, "\",\n    \"minutes\": ");
    buf_printf(out, "%d", reading_minutes(p->content));
    buf_puts(out, ",\n    \"content\": \"");
    json_escape(out, p->content);
    buf_puts(out, "\"\n  }");
    if (i + 1 < n) buf_puts(out, ",");
    buf_puts(out, "\n");
    free(url);
  }
  buf_puts(out, "]\n");
}

/* ========================= 扫描 / 排序 ========================= */

static int name_has_md_txt(const char *name) {
  size_t n = strlen(name);
  if (n > 3) {
    const char *e = name + n - 3;
    if (e[0] == '.' && (tolower((unsigned char)e[1]) == 'm') && tolower((unsigned char)e[2]) == 'd')
      return 1;
  }
  if (n > 4) {
    const char *e = name + n - 4;
    if (e[0] == '.' && tolower((unsigned char)e[1]) == 't' && tolower((unsigned char)e[2]) == 'x' &&
        tolower((unsigned char)e[3]) == 't')
      return 1;
  }
  return 0;
}

static int is_config_file(const char *name) {
  return !strcmp(name, "config.txt") || !strcmp(name, "config.md");
}

static int post_cmp(const void *pa, const void *pb) {
  const Post *a = (const Post *)pa, *b = (const Post *)pb;
  DateKey ka = parse_date_key(a->date), kb = parse_date_key(b->date);
  int c = date_key_cmp(&kb, &ka); /* 日期倒序 */
  if (c) return c;
  return strcmp(a->id, b->id); /* 同日期按 id 保证稳定 */
}

/* ========================= main ========================= */

static void usage(FILE *f) {
  fprintf(f,
          "用法: %s [选项]\n"
          "  --root DIR   站点根目录（默认 .）\n"
          "  --check      只检查静态页/清单是否已是最新，过期则退出码 1\n"
          "  --prune      删除源文章已不存在的旧静态页\n"
          "  -q, --quiet  少说话\n"
          "  -h, --help   显示本帮助\n",
          g_prog);
}

int main(int argc, char **argv) {
  const char *root = ".";
  int check = 0, prune = 0;

  for (int i = 1; i < argc; i++) {
    const char *a = argv[i];
    if (!strcmp(a, "--root") && i + 1 < argc) root = argv[++i];
    else if (!strcmp(a, "--check")) check = 1;
    else if (!strcmp(a, "--prune")) prune = 1;
    else if (!strcmp(a, "-q") || !strcmp(a, "--quiet")) g_quiet = 1;
    else if (!strcmp(a, "-h") || !strcmp(a, "--help")) { usage(stdout); return 0; }
    else { usage(stderr); return 2; }
  }

  Chrome chrome = load_chrome(root);
  StrList covers = load_covers(root);

  Buf dirpath;
  buf_init(&dirpath);
  buf_printf(&dirpath, "%s/posts", root);
  DIR *d = opendir(dirpath.s);
  if (!d) die("打不开 %s: %s", dirpath.s, strerror(errno));

  Post *posts = NULL;
  size_t n = 0, cap = 0;
  struct dirent *de;
  while ((de = readdir(d)) != NULL) {
    if (de->d_name[0] == '.') continue;
    if (!name_has_md_txt(de->d_name)) continue;
    if (is_config_file(de->d_name)) continue;

    Buf fp;
    buf_init(&fp);
    buf_printf(&fp, "%s/%s", dirpath.s, de->d_name);
    char *text = read_file(fp.s, NULL);
    if (!text) {
      fprintf(stderr, "%s: 跳过无法读取的 %s\n", g_prog, fp.s);
      buf_free(&fp);
      continue;
    }
    buf_free(&fp);
    if (n == cap) {
      cap = cap ? cap * 2 : 8;
      posts = realloc(posts, cap * sizeof *posts);
      if (!posts) die("内存不足");
    }
    posts[n++] = parse_md_file(de->d_name, text);
    free(text);
  }
  closedir(d);
  buf_free(&dirpath);

  if (!n && !g_quiet) printf("posts/ 里没有文章\n");
  qsort(posts, n, sizeof *posts, post_cmp);

  /* 渲染每篇文章；同时记录期望生成的文件名 */
  StrList expected = {0};
  size_t changed = 0, same = 0;
  int failures = 0;

  for (size_t i = 0; i < n; i++) {
    const Post *p = &posts[i];
    const char *cover = covers.v[cover_hash(p->id) % covers.n];
    const Post *prev = (i + 1 < n) ? &posts[i + 1] : NULL;
    const Post *next = (i > 0) ? &posts[i - 1] : NULL;

    Buf page;
    buf_init(&page);
    render_page(p, &chrome, cover, prev, next, &page);

    sl_push(&expected, p->id);

    Buf disk;
    buf_init(&disk);
    post_disk_path(&disk, root, p->id);

    if (check) {
      size_t old = 0;
      char *prev_data = read_file(disk.s, &old);
      if (!prev_data || old != page.n || memcmp(prev_data, page.s, page.n) != 0) {
        printf("%s  %s\n", prev_data ? "过期" : "缺失", disk.s);
        failures++;
      }
      free(prev_data);
    } else {
      int ch = 0;
      if (write_if_changed(disk.s, page.s, page.n, &ch) != 0) failures++;
      else if (ch) {
        changed++;
        if (!g_quiet) printf("写入 %s\n", disk.s);
      } else {
        same++;
      }
    }
    buf_free(&disk);
    buf_free(&page);
  }

  /* posts.json */
  Buf manifest;
  buf_init(&manifest);
  build_manifest(posts, n, &manifest);

  Buf mpath;
  buf_init(&mpath);
  buf_printf(&mpath, "%s/posts.json", root);
  if (check) {
    size_t old = 0;
    char *prev_data = read_file(mpath.s, &old);
    if (!prev_data || old != manifest.n || memcmp(prev_data, manifest.s, manifest.n) != 0) {
      printf("%s  %s\n", prev_data ? "过期" : "缺失", mpath.s);
      failures++;
    }
    free(prev_data);
  } else {
    int ch = 0;
    if (write_if_changed(mpath.s, manifest.s, manifest.n, &ch) != 0) failures++;
    else if (ch) {
      changed++;
      if (!g_quiet) printf("写入 %s（%lu 篇）\n", mpath.s, (unsigned long)n);
    } else {
      same++;
    }
  }

  /* 清理旧静态页 */
  DIR *rd = opendir(root);
  if (rd) {
    struct dirent *e2;
    while ((e2 = readdir(rd)) != NULL) {
      const char *nm = e2->d_name;
      size_t ln = strlen(nm);
      if (ln < 8 || strncmp(nm, "p-", 2) != 0) continue;
      if (strcmp(nm + ln - 5, ".html") != 0) continue;
      /* 只认我们自己生成的（文件里有标记） */
      Buf full;
      buf_init(&full);
      buf_printf(&full, "%s/%s", root, nm);
      char *data = read_file(full.s, NULL);
      int ours = data && strstr(data, GENERATED_MARK) != NULL;
      int known = 0;
      for (size_t k = 0; k < expected.n && !known; k++) {
        Buf want;
        buf_init(&want);
        buf_printf(&want, "p-%s.html", expected.v[k]);
        if (!strcmp(want.s, nm)) known = 1;
        buf_free(&want);
      }
      free(data);
      if (ours && !known) {
        if (check) {
          printf("多余  %s\n", full.s);
          failures++;
        } else if (prune) {
          if (remove(full.s) == 0) {
            printf("删除 %s（源文章已不存在）\n", full.s);
            changed++;
          } else {
            fprintf(stderr, "%s: 无法删除 %s\n", g_prog, full.s);
          }
        } else {
          printf("提示: %s 已无对应文章，可运行 make prune 删除\n", full.s);
        }
      } else if (ours) {
        /* 已知的静态页：--check 时已在上面比过内容 */
      }
      buf_free(&full);
    }
    closedir(rd);
  }

  if (check) {
    if (failures) {
      printf("\n有 %d 项需要重新渲染：请运行 make render 后再提交。\n", failures);
      return 1;
    }
    if (!g_quiet) printf("静态页与 posts.json 都是最新的（%lu 篇）\n", (unsigned long)n);
  } else if (!g_quiet) {
    printf("完成：%lu 篇，%lu 个文件更新，%lu 个未变\n", (unsigned long)n, (unsigned long)changed,
           (unsigned long)same);
    if (failures) printf("有 %d 个文件写入失败\n", failures);
  }

  int rc = failures ? 1 : 0;
  for (size_t i = 0; i < n; i++) post_free(&posts[i]);
  free(posts);
  sl_free(&expected);
  sl_free(&covers);
  free(chrome.header);
  free(chrome.widgets);
  free(chrome.footer);
  buf_free(&manifest);
  buf_free(&mpath);
  return rc;
}