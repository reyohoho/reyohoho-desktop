const { contextBridge, ipcRenderer } = require("electron/renderer");

contextBridge.exposeInMainWorld("electronAPI", {
  sendHotKey: (key) => ipcRenderer.send("on-hotkey", key),
  showToast: (message) => {
    const messageElement = document.createElement("div");
    messageElement.textContent = message;
    messageElement.style.position = "fixed";
    messageElement.style.bottom = "20px";
    messageElement.style.left = "20px";
    messageElement.style.padding = "16px 24px";
    messageElement.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
    messageElement.style.color = "white";
    messageElement.style.fontSize = "1.2rem";
    messageElement.style.borderRadius = "8px";
    messageElement.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.5)";
    messageElement.style.zIndex = "99000";
    messageElement.style.maxWidth = "300px";
    messageElement.style.wordWrap = "break-word";

    document.body.appendChild(messageElement);

    setTimeout(() => {
      document.body.removeChild(messageElement);
    }, 500);
  },
  openMirrorSelection: () => ipcRenderer.send("open-mirror-selection"),
  openParserSelection: () => ipcRenderer.send("open-parser-selection"),
});
