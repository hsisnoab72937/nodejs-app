# nodejs-app

一个精简的 Xray + Cloudflare Argo 启动脚本，仅依赖 `index.js` 与 `package.json`。
运行脚本后会自动生成/刷新 Reality 配置与订阅内容，无需额外的 shell 安装步骤。

## ✨ 功能概览

- 持久化存储 UUID、Reality 密钥对、ShortID 等信息，重启不会丢失
- 自动生成 Xray 配置文件，并写入 `node.txt` 订阅信息
- 监听 Cloudflare Argo 输出，自动捕获临时隧道域名
- 支持固定隧道（`ARGO_TOKEN`），并兼容自定义二进制路径
- 已完全移除 Hysteria 相关逻辑与文件

## 🚀 快速使用

1. **准备依赖二进制**
   - Cloudflared：默认放在 `/home/container/cf/cf`
   - Xray：默认放在 `/home/container/xy/xy`
   > 也可以通过环境变量 `CF_BIN`、`XRAY_BIN` 指定自定义路径。

2. **部署脚本**
   - 将仓库克隆或下载到目标目录
   - 根据需要修改/导出环境变量

3. **运行服务**

   ```bash
   node index.js
   ```

   程序启动后会在控制台输出节点信息，并将订阅写入 `node.txt`。

## ⚙️ 支持的环境变量

| 变量名 | 说明 | 默认值 |
| --- | --- | --- |
| `DOMAIN` | Reality 监听域名/出口 IP | `example.com` |
| `PORT` | Reality 监听端口 | `10008` |
| `UUID` | VLESS 用户 UUID | 自动生成 |
| `REMARKS_PREFIX` | 订阅备注前缀 | `nodejs-app` |
| `ARGO_TOKEN` | 固定隧道令牌 | *(空)* |
| `ARGO_DOMAIN` | 固定隧道对应域名（需与令牌匹配） | 自动捕获 / 占位符 |
| `PRIVATE_KEY` | Reality 私钥 | 自动生成并持久化 |
| `PUBLIC_KEY` | Reality 公钥 | 自动生成并持久化 |
| `SHORT_ID` | Reality ShortID | 自动生成并持久化 |
| `BASE_PATH` | 运行目录根路径 | `/home/container` |
| `CF_BIN` | Cloudflared 可执行文件路径 | `${BASE_PATH}/cf/cf` |
| `XRAY_BIN` | Xray 可执行文件路径 | `${BASE_PATH}/xy/xy` |
| `XRAY_CONFIG` | Xray 配置文件路径 | `${BASE_PATH}/xy/config.json` |
| `SUB_FILE` | 订阅文件输出路径 | `${BASE_PATH}/node.txt` |
| `META_FILE` | 元数据持久化文件 | `${BASE_PATH}/nodejs-app.json` |

> 未提供的变量会使用默认值或自动生成的内容，并存储在 `META_FILE` 指定的文件中。

## 📄 输出文件

- `node.txt`：当前节点订阅信息
- `nodejs-app.json`：持久化的运行时参数（UUID、Reality 密钥、ShortID 等）

## ⚠️ 免责声明

- 请确保在合法合规的前提下使用本项目
- 使用前请自行了解相关政策与风险
- 作者不对任何滥用行为或由此产生的损失负责
