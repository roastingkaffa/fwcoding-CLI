# fwai 安裝指南

> 提供兩種安裝方式，依據使用情境選擇。

---

## 方式一：GitHub Release（推薦給開發人員）

直接從 GitHub Release 下載預編譯版本，適合需要在本機日常開發使用的同事。

### 前置需求

- Node.js >= 20（[下載](https://nodejs.org/)）
- Git

### 安裝步驟

```bash
# 1. 下載最新 release tarball（替換 VERSION 為實際版本號）
VERSION=0.1.0
curl -L -o fwai.tar.gz \
  https://github.com/roastingkaffa/fwcoding-CLI/releases/download/v${VERSION}/fwai-${VERSION}.tar.gz

# 2. 解壓
tar -xzf fwai.tar.gz
cd fwai-release

# 3. 安裝 production 依賴
npm install --omit=dev

# 4. 全域連結，讓 fwai 指令可以在任何地方使用
npm link
```

### 或者：直接從 Git 安裝

```bash
# 一行搞定
npm install -g git+ssh://git@github.com:roastingkaffa/fwcoding-CLI.git

# 如果用 HTTPS
npm install -g git+https://github.com/roastingkaffa/fwcoding-CLI.git
```

### 驗證安裝

```bash
fwai --help
fwai doctor
```

### 設定 LLM API Key

```bash
# 擇一（看團隊用哪個 provider）
export ANTHROPIC_API_KEY="sk-ant-..."    # Anthropic Claude
export OPENAI_API_KEY="sk-..."           # OpenAI
export GOOGLE_API_KEY="..."              # Google Gemini

# 建議寫入 ~/.bashrc 或 ~/.zshrc 中
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.bashrc
```

### 初始化韌體專案

```bash
cd ~/your-firmware-project
fwai init        # 建立 .fwai/ 工作區
fwai doctor      # 檢查環境
fwai             # 進入互動模式
```

### 更新版本

```bash
# 重新下載新版本 tarball 覆蓋即可
# 或從 git 更新：
cd fwcoding-CLI/fwai
git pull
npm ci
npm run build
```

---

## 方式二：Docker（推薦給 CI/CD 或不想裝 Node.js 的同事）

使用預建的 Docker image，適合 CI pipeline 或希望零配置環境的同事。

### 前置需求

- Docker（[安裝](https://docs.docker.com/get-docker/)）

### 拉取 Image

```bash
# 從 GitHub Container Registry 拉取
docker pull ghcr.io/roastingkaffa/fwai:latest

# 或指定版本
docker pull ghcr.io/roastingkaffa/fwai:0.1.0
```

### 基本使用

```bash
# 查看幫助
docker run --rm ghcr.io/roastingkaffa/fwai:latest --help

# 在韌體專案目錄中使用（掛載 volume）
cd ~/your-firmware-project
docker run --rm -it \
  -v "$(pwd)":/workspace \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  ghcr.io/roastingkaffa/fwai:latest
```

### 建議設定 Shell Alias

在 `~/.bashrc` 或 `~/.zshrc` 中加入：

```bash
alias fwai='docker run --rm -it \
  -v "$(pwd)":/workspace \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  ghcr.io/roastingkaffa/fwai:latest'
```

之後就可以像本機安裝一樣直接使用：

```bash
cd ~/your-firmware-project
fwai init
fwai doctor
fwai
```

### CI/CD 中使用

**GitHub Actions：**

```yaml
jobs:
  firmware-ci:
    runs-on: ubuntu-latest
    container:
      image: ghcr.io/roastingkaffa/fwai:latest
    steps:
      - uses: actions/checkout@v4
      - name: Init workspace
        run: fwai init
      - name: Build & Test
        run: fwai run build_and_test --ci --yes --json
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

**GitLab CI：**

```yaml
firmware-build:
  image: ghcr.io/roastingkaffa/fwai:latest
  script:
    - fwai init
    - fwai run build_and_test --ci --yes --json
  variables:
    ANTHROPIC_API_KEY: $ANTHROPIC_API_KEY
```

### 自行建置 Docker Image

如果需要加入 ARM 工具鏈或自訂工具：

```bash
# Clone repo
git clone git@github.com:roastingkaffa/fwcoding-CLI.git
cd fwcoding-CLI/fwai

# 建置
docker build -t fwai:custom .

# 或擴充 image（建立自己的 Dockerfile）
```

```dockerfile
# Dockerfile.custom
FROM ghcr.io/roastingkaffa/fwai:latest

# 加入 ARM 工具鏈
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc-arm-none-eabi \
    gdb-multiarch \
    openocd \
    && rm -rf /var/lib/apt/lists/*
```

```bash
docker build -f Dockerfile.custom -t fwai:with-toolchain .
```

### 更新 Docker Image

```bash
docker pull ghcr.io/roastingkaffa/fwai:latest
```

---

## 發佈新版本（給維護者）

```bash
# 1. 更新 package.json 版本號
cd fwai
npm version 0.2.0

# 2. 推送 tag（觸發 GitHub Actions 自動建置 + 發佈）
git push origin v0.2.0
```

GitHub Actions 會自動：
1. 執行 type check + tests
2. 建立 tarball 上傳至 GitHub Release
3. 建置 Docker image 推送至 ghcr.io
4. 生成 SBOM

---

## 版本對照表

| 安裝方式 | 適用對象 | 優點 | 缺點 |
|----------|----------|------|------|
| **GitHub Release** | 開發人員 | 完整 Node.js 存取、可搭配本機工具鏈 | 需自行安裝 Node.js |
| **Docker** | CI/CD、非開發人員 | 零配置、環境一致 | 需掛載 volume、硬體存取較麻煩 |

---

## 常見問題

### Q: Docker 中如何存取 USB 序列埠？

```bash
docker run --rm -it \
  --device=/dev/ttyUSB0 \
  -v "$(pwd)":/workspace \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  ghcr.io/roastingkaffa/fwai:latest
```

### Q: 公司有 proxy 怎麼辦？

```bash
# Docker
docker run --rm -it \
  -e HTTP_PROXY="http://proxy:8080" \
  -e HTTPS_PROXY="http://proxy:8080" \
  ghcr.io/roastingkaffa/fwai:latest

# npm
npm config set proxy http://proxy:8080
npm install -g git+https://github.com/roastingkaffa/fwcoding-CLI.git
```

### Q: 如何同時安裝多版本？

```bash
# Docker 天然支援
docker pull ghcr.io/roastingkaffa/fwai:0.1.0
docker pull ghcr.io/roastingkaffa/fwai:0.2.0

# 用 tag 區分
alias fwai-v1='docker run --rm -it -v "$(pwd)":/workspace ghcr.io/roastingkaffa/fwai:0.1.0'
alias fwai-v2='docker run --rm -it -v "$(pwd)":/workspace ghcr.io/roastingkaffa/fwai:0.2.0'
```
