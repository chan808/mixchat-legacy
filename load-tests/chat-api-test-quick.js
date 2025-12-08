import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Trend } from 'k6/metrics';

// 커스텀 메트릭 정의
const messagesReceived = new Counter('messages_received');
const messageLatency = new Trend('message_latency');
const roomListLatency = new Trend('room_list_latency');

// 빠른 테스트 설정 (5분 버전)
export const options = {
  stages: [
    { duration: '30s', target: 50 },   // 30초간 50명까지
    { duration: '1m', target: 50 },    // 1분간 50명 유지
    { duration: '30s', target: 100 },  // 30초간 100명까지
    { duration: '1m', target: 100 },   // 1분간 100명 유지
    { duration: '30s', target: 200 },  // 30초간 200명까지
    { duration: '1m', target: 200 },   // 1분간 200명 유지
    { duration: '30s', target: 0 },    // 30초간 종료
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:getMessages}': ['p(95)<800'],
    'http_req_duration{endpoint:getRoomList}': ['p(95)<500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

const users = new SharedArray('test users', function () {
  return [
    { email: 'test1@test.com', password: 'test1234', id: 1 },
    { email: 'test2@test.com', password: 'test1234', id: 2 },
    { email: 'test3@test.com', password: 'test1234', id: 3 },
    { email: 'test4@test.com', password: 'test1234', id: 4 },
    { email: 'test5@test.com', password: 'test1234', id: 5 },
  ];
});

function login(email, password) {
  const loginRes = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify({
    email: email,
    password: password,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(loginRes, {
    'login status 200': (r) => r.status === 200,
  });

  if (loginRes.status === 200) {
    const body = JSON.parse(loginRes.body);
    return body.data;
  }
  return null;
}

function getGroupRoomList(token) {
  const startTime = new Date();
  const res = http.get(`${BASE_URL}/api/v1/chats/rooms/group`, {
    headers: { 'Authorization': `Bearer ${token}` },
    tags: { endpoint: 'getRoomList' },
  });

  roomListLatency.add(new Date() - startTime);
  check(res, { 'group room list status 200': (r) => r.status === 200 });

  if (res.status === 200) {
    const body = JSON.parse(res.body);
    return body.data || [];
  }
  return [];
}

function getMessages(token, roomId, chatRoomType, cursor = null, size = 25) {
  const startTime = new Date();
  let url = `${BASE_URL}/api/v1/chats/rooms/${roomId}/messages?chatRoomType=${chatRoomType}&size=${size}`;
  if (cursor !== null) {
    url += `&cursor=${cursor}`;
  }

  const res = http.get(url, {
    headers: { 'Authorization': `Bearer ${token}` },
    tags: { endpoint: 'getMessages' },
  });

  messageLatency.add(new Date() - startTime);
  check(res, { 'get messages status 200': (r) => r.status === 200 });

  if (res.status === 200) {
    messagesReceived.add(1);
    const body = JSON.parse(res.body);
    return body.data.messagePageResp || null;
  }
  return null;
}

function getPublicGroupRooms(token) {
  const res = http.get(`${BASE_URL}/api/v1/chats/rooms/group/public`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (res.status === 200) {
    const body = JSON.parse(res.body);
    return body.data || [];
  }
  return [];
}

function joinGroupRoom(token, roomId) {
  const res = http.post(`${BASE_URL}/api/v1/chats/rooms/group/${roomId}/join`,
    JSON.stringify({}),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  check(res, {
    'join group room success': (r) => r.status === 200 || r.status === 400,
  });

  // 200: 성공, 400: 이미 참여 중 (둘 다 OK)
  return res.status === 200 || res.status === 400;
}

export default function () {
  const userIndex = (__VU - 1) % users.length;
  const user = users[userIndex];
  const token = login(user.email, user.password);

  if (!token) return;

  sleep(0.5);

  getGroupRoomList(token);
  sleep(0.3);

  const publicRooms = getPublicGroupRooms(token);
  sleep(0.3);

  // 비밀번호 없는 방만 필터링
  const roomsWithoutPassword = publicRooms.filter(room => !room.hasPassword);

  if (roomsWithoutPassword.length > 0) {
    const randomRoom = roomsWithoutPassword[Math.floor(Math.random() * roomsWithoutPassword.length)];
    // NOTE: API 응답에서 roomId가 아닌 id 필드명 사용
    // 먼저 채팅방에 참여해야 메시지 조회 가능
    const joined = joinGroupRoom(token, randomRoom.id);
    sleep(0.3);

    if (joined) {
      getMessages(token, randomRoom.id, 'GROUP', null, 25);
    }
  }

  sleep(1);
}

export function setup() {
  console.log('=== 빠른 부하 테스트 (5분 버전) ===');
  console.log(`대상 서버: ${BASE_URL}`);
  return { startTime: new Date() };
}

export function teardown(data) {
  const duration = (new Date() - data.startTime) / 1000 / 60;
  console.log(`총 테스트 시간: ${duration.toFixed(2)}분`);
}
