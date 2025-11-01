# nodejs-app

This project provides a streamlined solution for deploying a proxy service using Xray and Cloudflare Argo. It has been refactored to remove the Hysteria protocol and consolidate all configuration and process management into a single `index.js` file.

## Features

- **Simplified Setup**: No more shell scripts or separate configuration files. Everything is managed within `index.js`.
- **Dynamic Configuration**: Automatically generates UUIDs, short IDs, and Xray key pairs on startup.
- **Cloudflare Argo Tunnel**: Integrates with Cloudflare Argo to expose the proxy service to the internet securely.
- **Automated Binary Management**: Downloads the required Xray and Cloudflared binaries on the first run.
- **Keep-Alive**: Automatically restarts any of the managed processes if they crash.

## Prerequisites

- Node.js installed on your system.
- A domain managed by Cloudflare.
- (Optional) A Cloudflare Argo Tunnel token (`ARGO_TOKEN`) for a more stable tunnel connection.

## Getting Started

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/hsisnoab72937/nodejs-app.git
    cd nodejs-app
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Configure environment variables:**

    You can set the following environment variables to configure the application:

    - `DOMAIN`: Your domain name (e.g., `your.domain.com`).
    - `PORT`: The port for the Reality protocol.
    - `UUID`: A unique identifier for your user. If not set, a random one will be generated.
    - `ARGO_TOKEN`: Your Cloudflare Argo Tunnel token.
    - `REMARKS_PREFIX`: A prefix for the generated subscription links.

    You can set them in your shell:

    ```bash
    export DOMAIN="your.domain.com"
    export PORT="443"
    # and so on...
    ```

4.  **Run the application:**

    ```bash
    npm start
    ```

Upon starting, the application will download the necessary binaries, generate configurations, and print the subscription links to the console. It will also save them to a `node.txt` file in the `/home/container` directory.

## How It Works

The `index.js` script performs the following actions:

1.  Reads environment variables for configuration.
2.  Checks for the existence of `cloudflared` (`cf`) and `xray` (`xy`) binaries and downloads them if they are not found.
3.  Generates an X25519 key pair and a short ID for the Reality protocol.
4.  Creates an Xray configuration file in memory.
5.  Starts the `cloudflared` and `xray` processes.
6.  If not using an `ARGO_TOKEN`, it captures the temporary Argo domain from the `cloudflared` output.
7.  Generates and displays the VLESS subscription links for both Argo (WebSocket) and Reality.
8.  Monitors the processes and restarts them if they exit unexpectedly.
