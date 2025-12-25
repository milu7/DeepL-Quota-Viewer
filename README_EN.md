# DeepL-Quota-Viewer

A lightweight Web tool to query DeepL API usage (characters used / total limit). It includes a PHP backend proxy to resolve CORS issues when making requests directly from the browser to the DeepL API, and provides a secure, easy-to-use frontend interface to manage multiple API keys.

[中文文档](README.md)

## 🚀 Features

*   **🔍 Real-time Usage Query**: One-click to view character usage for DeepL Free/Pro APIs.
*   **🛡️ Secure & Private**:
    *   API keys are stored **only** in your local browser (LocalStorage).
    *   **Encrypted Storage**: Keys are encrypted using Browser Fingerprint + AES, making them hard to decrypt on other devices even if exported.
    *   PHP backend acts only as a proxy and does not log your API keys (masked info is logged only when debug logging is enabled).
*   **🔄 CORS Proxy**: Built-in `api.php` proxy perfectly resolves Cross-Origin Resource Sharing (CORS) errors when requesting DeepL API from the frontend.
*   **📋 Batch Import**: Supports batch identification and import of API keys by pasting text (flexible format).
*   **💾 Configuration Management**: Supports export/import of configurations for easy backup.

## 🛠️ Tech Stack

*   **Frontend**: HTML5, Bootstrap 5, JavaScript (Vanilla), CryptoJS (for encryption)
*   **Backend**: PHP (CURL)

## 📦 Installation & Usage

### Prerequisites
*   A Web Server supporting PHP (e.g., Apache, Nginx, or PHP built-in server).
*   PHP must have the `curl` extension enabled.

### Deployment Steps

1.  **Download Code**:
    Clone this repository or download the ZIP archive to your Web Server's root directory.
    ```bash
    git clone https://github.com/milu7/DeepL-Quota-Viewer.git
    ```

2.  **Start Service**:
    If you don't have a Web Server, you can quickly start using the PHP built-in server:
    ```bash
    cd DeepL-Quota-Viewer
    php -S localhost:8000
    ```

3.  **Access**:
    Open your browser and visit `http://localhost:8000`.

### How to Use

1.  **Import Keys**:
    Paste text containing API keys into the text box on the homepage. The program will automatically identify the format (supports `xxxx:xxxx` or multi-line text).
    *   Example Format:
        ```text
        Key: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx
        Note: My Personal Account
        ```
2.  **Click "One-click Identify and Import"**.
3.  Click the **"Refresh"** icon in the list below to view current usage.

## 🔒 Security Notes

*   **About api.php**: This file is only used to forward requests to `api-free.deepl.com`. It checks CSRF Tokens to prevent Cross-Site Request Forgery.
*   **About API Keys**: Keys are not uploaded to any third-party server. They are only forwarded to the official DeepL interface via your server when you click query.

## 📄 License

This project is open-sourced under the [MIT License](LICENSE).
