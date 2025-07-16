const { contextBridge, ipcRenderer } = require("electron/renderer");

contextBridge.exposeInMainWorld("electronAPI", {
  sendHotKey: (key) => ipcRenderer.send("on-hotkey", key),
  showToast: (message) => {
    const messageElement = document.createElement("div");
    messageElement.textContent = message;
    messageElement.style.position = "fixed";
    messageElement.style.top = "0";
    messageElement.style.left = "0";
    messageElement.style.width = "100%";
    messageElement.style.height = "100%";
    messageElement.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
    messageElement.style.color = "white";
    messageElement.style.display = "flex";
    messageElement.style.justifyContent = "center";
    messageElement.style.alignItems = "center";
    messageElement.style.fontSize = "2rem";
    messageElement.style.zIndex = "99000";

    document.body.appendChild(messageElement);

    setTimeout(() => {
      document.body.removeChild(messageElement);
    }, 500);
  },
  openMirrorSelection: () => ipcRenderer.send("open-mirror-selection"),
  openParserSelection: () => ipcRenderer.send("open-parser-selection"),
});
