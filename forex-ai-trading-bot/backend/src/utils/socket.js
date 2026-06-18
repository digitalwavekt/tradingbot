const { Server } = require('socket.io');
const logger = require('./logger');

let io = null;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "*",
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    logger.info(`🔌 Client connected to socket: ${socket.id}`);

    socket.on('disconnect', () => {
      logger.info(`❌ Client disconnected from socket: ${socket.id}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    logger.warn("Socket.io not initialized!");
  }
  return io;
};

// एडमिन पैनल को लाइव डेटा भेजने का हेल्पर फंक्शन
const emitAdminUpdate = (event, data) => {
  if (io) {
    io.emit(`admin:${event}`, data);
  }
};

module.exports = { initSocket, getIO, emitAdminUpdate };
