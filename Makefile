# yaolin 博客 · 静态渲染
#
#   make          编译渲染器（tools/render.c → tools/render）
#   make render   把 posts/ 里的文章渲染成 posts/p-<id>.html 与 posts.json
#   make check    只检查是否过期（推送前/CI 用；过期时退出码为 1）
#   make prune    删除源文章已不存在的旧静态页（根目录里的旧位置残留会顺手清掉）
#   make clean    清理编译产物

CC      ?= cc
CFLAGS  ?= -O2 -std=gnu11 -Wall -Wextra -Wpedantic -Wshadow
LDLIBS  ?= -lm
RENDER  := tools/render

all: $(RENDER)

$(RENDER): tools/render.c
	$(CC) $(CFLAGS) -o $@ $< $(LDLIBS)

render: $(RENDER)
	./$(RENDER)

check: $(RENDER)
	./$(RENDER) --check

prune: $(RENDER)
	./$(RENDER) --prune

clean:
	rm -f $(RENDER) tools/*.o

.PHONY: all render check prune clean