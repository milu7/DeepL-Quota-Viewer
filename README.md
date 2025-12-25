# DeepL API 用量查询 (DeepL API Usage Proxy)

这是一个轻量级的 Web 工具，用于查询 DeepL API 的当前用量（已用字符数/总额度）。它包含一个 PHP 后端代理，用于解决浏览器直接请求 DeepL API 时的 CORS（跨域）问题，并提供了一个安全、易用的前端界面来管理多个 API 密钥。

## 🚀 功能特点

*   **🔍 实时用量查询**：一键查看 DeepL Free/Pro API 的字符使用情况。
*   **🛡️ 安全隐私**：
    *   API 密钥仅存储在您的本地浏览器（LocalStorage）中。
    *   **加密存储**：使用浏览器指纹 + AES 对密钥进行加密存储，即使数据被导出也难以在其他设备解密。
    *   PHP 后端仅作转发，不记录您的 API 密钥（仅在调试日志开启时记录掩码后的信息）。
*   **🔄 CORS 代理**：内置 `api.php` 代理，完美解决前端直接请求 DeepL API 出现的跨域错误。
*   **📋 批量导入**：支持通过粘贴文本批量识别并导入 API 密钥（格式灵活）。
*   **💾 配置管理**：支持导出/导入配置，方便备份。

## 🛠️ 技术栈

*   **前端**：HTML5, Bootstrap 5, JavaScript (原生), CryptoJS (用于加密)
*   **后端**：PHP (CURL)

## 📦 安装与使用

### 前置要求
*   一个支持 PHP 的 Web 服务器 (如 Apache, Nginx, 或 PHP 内置服务器)。
*   PHP 需开启 `curl` 扩展。

### 部署步骤

1.  **下载代码**：
    克隆本仓库或下载 ZIP 包到您的 Web 服务器根目录。
    ```bash
    git clone https://github.com/your-username/deepl-proxy.git
    ```

2.  **启动服务**：
    如果您没有 Web 服务器，可以使用 PHP 内置服务器快速启动：
    ```bash
    cd deepl-proxy
    php -S localhost:8000
    ```

3.  **访问**：
    打开浏览器访问 `http://localhost:8000`。

### 使用方法

1.  **导入密钥**：
    在首页的文本框中粘贴包含 API 密钥的文本。程序会自动识别格式（支持 `xxxx:xxxx` 或多行文本）。
    *   示例格式：
        ```text
        密钥：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx
        备注：我的个人账号
        ```
2.  **点击“一键识别并导入”**。
3.  在下方列表中点击 **“刷新”** 图标即可查看当前用量。

## 🔒 安全说明

*   **关于 api.php**：该文件仅用于转发请求到 `api-free.deepl.com`。它会检查 CSRF Token 以防止跨站请求伪造。
*   **关于 API 密钥**：密钥不会上传到任何第三方服务器，仅在您点击查询时通过您的服务器转发给 DeepL 官方接口。

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源。
