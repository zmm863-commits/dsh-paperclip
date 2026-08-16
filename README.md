# dsh-paperclip

DSH Web GUI 回形针按钮插件：在输入框右侧添加一个 📎 按钮，点击选择文件（支持拖拽），文件内容自动插入到输入框，方便把代码/文本直接发给 agent。

A single 📎 paperclip button in the DSH web GUI composer: click to pick files (or drag & drop), file contents are inserted into the textarea so you can hand code/text to the agent directly.

## 功能 Features

- 📎 输入框右侧回形针按钮，一键选择文件
- 🖱️ 支持拖拽文件到输入框
- 📄 支持常见文本/代码格式（HTML、JS、TS、CSS、JSON、MD、Python 等 30+ 扩展名）
- 🔤 多文件批量上传（最多 10 个，单个 ≤ 5MB）
- 🌐 中英文双语（zh / en）
- 🧩 零服务端依赖，纯浏览器端实现

## 安装 Install

```bash
dsh plugin --profile web add dsh-paperclip
```

或者手动安装（本仓库）：

```bash
dsh plugin --profile web add ./dsh-paperclip
```

## 使用 Usage

1. 刷新 Web GUI 页面
2. 点击输入框右侧的 📎 按钮选择文件，或直接把文件拖进输入框
3. 文件内容会以代码块格式插入输入框：

```
📄 index.html (1.2 KB)
```html
<!DOCTYPE html>
...
```
```

4. 发送消息，agent 即可读取文件内容

## 开发 Development

```bash
npm install
npm run build    # 构建 lib/（tsdown）
npm run watch    # 监听模式
```

## 许可证 License

MIT
