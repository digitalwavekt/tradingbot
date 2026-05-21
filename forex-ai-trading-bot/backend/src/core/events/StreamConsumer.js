const os = require('os');
const eventBus = require('./RedisStreamBus');
const logger = require('../../utils/logger');

class StreamConsumer {
  constructor({ stream, groupName, consumerName, handler, count = 25, blockMs = 5000 }) {
    this.stream = stream;
    this.groupName = groupName;
    this.consumerName = consumerName || `${os.hostname()}-${process.pid}`;
    this.handler = handler;
    this.count = count;
    this.blockMs = blockMs;
    this.running = false;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    await eventBus.ensureGroup(this.stream, this.groupName);
    this.loop();
  }

  stop() {
    this.running = false;
  }

  async loop() {
    while (this.running) {
      try {
        const messages = await eventBus.readGroup({
          stream: this.stream,
          groupName: this.groupName,
          consumerName: this.consumerName,
          count: this.count,
          blockMs: this.blockMs
        });

        for (const message of messages) {
          try {
            await this.handler(message.event, message);
            await eventBus.ack(this.stream, this.groupName, message.messageId);
          } catch (error) {
            logger.error(`Stream consumer handler failed: ${error.message}`, {
              stream: this.stream,
              groupName: this.groupName,
              messageId: message.messageId
            });
            await eventBus.publishToDeadLetter(message, error);
          }
        }
      } catch (error) {
        logger.error(`Stream consumer loop failed: ${error.message}`, {
          stream: this.stream,
          groupName: this.groupName
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
}

module.exports = StreamConsumer;
