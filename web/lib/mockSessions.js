/**
 * Mock sessions matching the Chrome extension session record shape.
 * @see extension/content.js — createSessionRecord
 */
export const mockSessions = [
  {
    id: "sess_1_1713000000000",
    schemaVersion: 1,
    timestamp: "2026-04-14T10:22:15.432Z",
    mode: "play",
    totalHits: 18,
    durationSeconds: 12.4,
    hitsPerSecond: 1.4516,
    generationStarted: true,
    generationEndedSuccessfully: true,
    metrics: { normalizedScore: 1.4516 }
  },
  {
    id: "sess_2_1713001200000",
    schemaVersion: 1,
    timestamp: "2026-04-14T11:05:41.201Z",
    mode: "play",
    totalHits: 42,
    durationSeconds: 28.1,
    hitsPerSecond: 1.4947,
    generationStarted: true,
    generationEndedSuccessfully: true,
    metrics: { normalizedScore: 1.4947 }
  },
  {
    id: "sess_3_1713004000000",
    schemaVersion: 1,
    timestamp: "2026-04-14T14:33:02.887Z",
    mode: "brain",
    totalHits: 9,
    durationSeconds: 45.2,
    hitsPerSecond: 0.1991,
    generationStarted: true,
    generationEndedSuccessfully: true,
    metrics: { normalizedScore: 0.1991 }
  },
  {
    id: "sess_4_1713005000000",
    schemaVersion: 1,
    timestamp: "2026-04-15T09:12:00.100Z",
    mode: "play",
    totalHits: 7,
    durationSeconds: 4.2,
    hitsPerSecond: 1.6667,
    generationStarted: true,
    generationEndedSuccessfully: false,
    metrics: { normalizedScore: 1.6667 }
  },
  {
    id: "sess_5_1713006000000",
    schemaVersion: 1,
    timestamp: "2026-04-15T09:45:33.555Z",
    mode: "focus",
    totalHits: 0,
    durationSeconds: 8.0,
    hitsPerSecond: 0,
    generationStarted: true,
    generationEndedSuccessfully: true,
    metrics: { normalizedScore: 0 }
  }
];

export function computeAggregates(sessions) {
  const n = sessions.length;
  const totalHits = sessions.reduce((sum, s) => sum + (s.totalHits || 0), 0);
  const hpsValues = sessions.map((s) => Number(s.hitsPerSecond) || 0);
  const avgHps = n ? hpsValues.reduce((a, b) => a + b, 0) / n : 0;
  const bestHps = n ? Math.max(...hpsValues) : 0;
  return {
    totalSessions: n,
    totalHits,
    averageHitsPerSecond: avgHps,
    bestHitsPerSecond: bestHps
  };
}
