# 发布与市场服务部署示例

以下以 `/opt/mud-agent` 为示例部署目录。请将客户端 `.env` 中的 `VITE_RELEASE_API_BASE_URL` 设置为你自己的 HTTPS 服务地址（例如 `https://release.example.com`）。

- 部署目录：`/opt/mud-agent`
- 当前代码：`/opt/mud-agent/app`，符号链接指向 `releases/` 下的发布目录
- Compose 配置：`/opt/mud-agent/compose.yaml`，对应本仓库 `deploy/compose.server.yaml`
- 市场持久化数据：`/opt/mud-agent/data/market`
- 容器：`mud-agent-api`，自动重启策略 `unless-stopped`
- 发布和市场服务无需安装 npm 依赖；容器只运行 Node.js 服务端入口

## 常用运维命令

在服务器上执行：

```bash
cd /opt/mud-agent
docker compose ps
docker compose logs --tail 100 api
docker compose restart api
curl --fail http://127.0.0.1:4058/health
curl --fail http://127.0.0.1:4058/api/market/items
```

## 昵称、私密签名与账号权限

用户在客户端首次输入唯一昵称，服务端自动签发私密签名并绑定游戏账号名。换客户端须在旧客户端导出签名再导入；已有昵称不会重复签发。不再绑定游戏服务器和区服。

管理员可以按昵称或游戏账号控制上传：

```bash
docker exec mud-agent-api npm run market:admin -- block "江湖客"
docker exec mud-agent-api npm run market:admin -- unblock "江湖客"
docker exec mud-agent-api npm run market:admin -- block-account hero
docker exec mud-agent-api npm run market:admin -- unblock-account hero
```

身份存储在 `identities.json`，账号禁用名单在 `blocked-accounts.json`，服务端仅存签名哈希。管理员不能重新签发已有昵称的私密签名。

## 更新与备份

上传新的服务端代码到 `/opt/mud-agent/releases/` 下的新目录，校验后将 `app` 符号链接切换到新目录，执行 `docker compose up -d --force-recreate api`。不要替换或清空 `data` 目录。镜像升级后也需重新创建容器。

备份整个 `/opt/mud-agent/data` 目录，保留 `compose.yaml` 和历史发布目录。市场文件存储仅支持单个写入服务进程。

每日新上传额度为每游戏账号 4 个 Skill/脚本合计，北京时间零点重置；“想都别想”不限额。更新不占额度，删除不返还额度。计数与内容保存在 version 2 的 `items.json` 快照中；若回退到旧版数组格式代码，必须同时恢复匹配的升级前数据备份。

完整市场接口及权限说明见 [server/MARKETPLACE.md](../server/MARKETPLACE.md)。
