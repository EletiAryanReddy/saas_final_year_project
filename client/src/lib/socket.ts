import { io, Socket } from 'socket.io-client';
import { getToken } from './api';

export function createSocket(): Socket {
  return io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000', {
    auth: (cb) => cb({ token: getToken() }),
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 5000,
  });
}
