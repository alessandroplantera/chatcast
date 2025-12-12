// Minimal Socket.IO client helper
(function (global) {
  const SocketClient = {
    socket: null,
    connect() {
      if (this.socket) return this.socket;
      if (typeof io === 'undefined') {
        console.warn('Socket.IO client not found (io). Is /socket.io/socket.io.js loaded?');
        return null;
      }
      this.socket = io();
      this.socket.on('connect', () => {
        console.log('Socket connected:', this.socket.id);
      });
      this.socket.on('connect_error', (err) => {
        console.error('Socket connect error:', err);
      });
      return this.socket;
    },
    joinSession(sessionId) {
      if (!this.socket) this.connect();
      if (!this.socket) return;
      this.socket.emit('join', `session:${sessionId}`);
    },
    leaveSession(sessionId) {
      if (!this.socket) return;
      this.socket.emit('leave', `session:${sessionId}`);
    },
    on(event, cb) {
      if (!this.socket) this.connect();
      if (!this.socket) return;
      this.socket.on(event, cb);
    }
    ,
    off(event, cb) {
      if (!this.socket) return;
      this.socket.off(event, cb);
    }
  };

  global.SocketClient = SocketClient;
})(window);
