const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function createRoomCode(length = 6): string {
  let room = ''

  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(Math.random() * ROOM_ALPHABET.length)
    room += ROOM_ALPHABET[index]
  }

  return room
}

export function createJoinUrl(roomCode: string): string {
  const url = new URL(window.location.href)
  url.hash = `#/join?room=${encodeURIComponent(roomCode)}`
  return url.toString()
}
