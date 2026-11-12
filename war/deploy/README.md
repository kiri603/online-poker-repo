# 全面战争的服务器部署

入口为 https://sanguoddz.xyz/war/，与现有扑克站共用域名和 HTTPS。扑克首页、`/api/`、`/ws/` 和数据库由原来的部署流程维护。

## GitHub 自动发布

源码维护在当前仓库的 `codex/war` 分支、`war/` 目录。向此分支推送游戏改动会触发 `.github/workflows/deploy-war.yml`，依次执行锁文件安装、测试、依赖审计、构建、上传、服务切换与公网双端 WebSocket 冒烟测试。原扑克发布只监听 `main`，因此这里的推送不会触发扑克重启。两个发布工作流共用 `poker-production` 并发组，避免同时修改服务器。

工作流复用原仓库的三个 Secret：

| 名称 | 含义 |
| --- | --- |
| `SERVER_HOST` | SSH 服务器地址，当前目标是 `39.102.60.181`。 |
| `SERVER_USER` | SSH 登录用户。 |
| `SERVER_PASSWORD` | SSH 登录密码；现有工作流使用密码，没有使用私钥。 |

在仓库 Settings → Secrets and variables → Actions 中可查看名称和更新时间。已保存的值无法回显，但仍可供工作流使用。无需为部署把密码、私钥复制到聊天或源码里；只有现有密码失效时才需要在服务器重置，并更新相应 Secret。

## 服务器结构

- `/opt/war-game/releases/<运行ID>-<尝试次数>/` 是每次发布的独立目录，包含 Node.js 22 运行时，服务器无需全局安装 Node/npm。
- `/opt/war-game/current` 指向当前版本，`war-game.service` 使用无登录权限的动态用户运行，只监听 `127.0.0.1:5190`。
- `/etc/nginx/snippets/war-game.conf` 定义 `/war` 重定向及 `/war/` HTTP/WSS 反向代理，包含在现有域名的 HTTPS 配置里。
- `/opt/war-game/backups/<运行ID>-<尝试次数>/` 保存该次切换前的 Nginx、服务配置和前一版路径。
- 发布脚本先校验包的 SHA256，再切换服务和测试 Nginx；失败时恢复前一版及代理配置。旧版本目录保留，便于恢复。

运维命令需通过服务器终端执行：

```bash
sudo systemctl status war-game
sudo journalctl -u war-game -n 100 --no-pager
curl -fsS http://127.0.0.1:5190/health
curl -fsS https://sanguoddz.xyz/war/health
```

`BATTLE_TRUST_PROXY=1` 仅信任来自本机 Nginx 的有效 `X-Real-IP`，用于区分玩家的连接限额。Nginx 覆盖客户端提交的该头；进程无需开放公网端口。

## 更新与恢复

在 `codex/war` 分支修改 `war/` 下源码并推送即可发布。修改后检查 Actions 的 `Deploy war demo`，成功后刷新页面。重启游戏进程会丢失内存房间，当前对局需要重新创建。

需要回到旧代码时，在此分支还原对应游戏提交并推送，通过同一条测试和发布流程重新部署。服务器上的旧版本目录和 `previous-release` 也保留了人工恢复所需的位置。不要直接运行旧的扑克发布脚本来恢复游戏。

游戏规则与联网限制见上一级的 `PVP方案.md`。单机敌方有独立指挥，会在失去视野后继续侦察；PVP 两方均默认待命，由玩家下令。
