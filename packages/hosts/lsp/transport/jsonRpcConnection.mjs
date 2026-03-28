import process from 'node:process';
import data from '../../../../jsondata/lsp.data.json' with { type: 'json' };

const HEADER_SEPARATOR = Buffer.from(data.headerSeparator, 'ascii');

export class JsonRpcConnection {
  constructor({ onRequest, onNotification, onProtocolError, onNotificationError }) {
    this.onRequest = onRequest;
    this.onNotification = onNotification;
    this.onProtocolError = onProtocolError;
    this.onNotificationError = onNotificationError;
    this.buffer = Buffer.alloc(0);
    process.stdin.on('data', (chunk) =>
      this.handleData(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    process.stdin.on('error', (error) => console.error('[utu-lsp] stdin error:', error));
  }

  sendNotification(method, params) {
    this.send(jsonRpc({ method, params }));
  }

  sendResult(id, result) {
    this.send(jsonRpc({ id, result }));
  }

  sendError(id, code, message, data) {
    this.send(
      jsonRpc({
        id,
        error: data === undefined ? { code, message } : { code, message, data },
      }),
    );
  }

  async handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf(HEADER_SEPARATOR);
      if (headerEnd < 0) return;
      const headerText = this.buffer.slice(0, headerEnd).toString('utf8');
      const contentLength = getContentLength(headerText);
      if (contentLength === undefined) {
        this.buffer = this.buffer.slice(headerEnd + HEADER_SEPARATOR.length);
        this.onProtocolError?.(null, 'Missing Content-Length header.');
        continue;
      }
      const bodyStart = headerEnd + HEADER_SEPARATOR.length;
      const bodyEnd = bodyStart + contentLength;
      if (this.buffer.length < bodyEnd) return;
      const body = this.buffer.slice(bodyStart, bodyEnd).toString('utf8');
      this.buffer = this.buffer.slice(bodyEnd);
      let message;
      try {
        message = JSON.parse(body);
      } catch (error) {
        this.onProtocolError?.(null, 'Invalid JSON payload.', error);
        continue;
      }
      await this.dispatch(message);
    }
  }

  async dispatch(message) {
    if (!isJsonRpcMessage(message)) {
      this.onProtocolError?.(null, 'Expected a JSON-RPC 2.0 message.');
      return;
    }
    if (isJsonRpcRequest(message)) {
      await this.onRequest(message);
      return;
    }
    if (isJsonRpcNotification(message)) {
      try {
        await this.onNotification(message);
      } catch (error) {
        this.onNotificationError?.(error);
      }
      return;
    }
    if (!('id' in message)) {
      this.onProtocolError?.(null, 'Invalid JSON-RPC message.');
    }
  }

  send(message) {
    const payload = Buffer.from(JSON.stringify(message), 'utf8');
    process.stdout.write(`Content-Length: ${payload.length}\r\n\r\n`, 'utf8');
    process.stdout.write(payload);
  }
}

function getContentLength(headerText) {
  const match = /Content-Length:\s*(\d+)/i.exec(headerText);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function isObject(value) {
  return typeof value === 'object' && value !== null;
}

function isJsonRpcMessage(value) {
  return isObject(value) && value.jsonrpc === '2.0';
}

function isJsonRpcRequest(value) {
  return isObject(value) && typeof value.method === 'string' && 'id' in value;
}

function isJsonRpcNotification(value) {
  return isObject(value) && typeof value.method === 'string' && !('id' in value);
}

function jsonRpc(message) {
  return { jsonrpc: '2.0', ...message };
}
