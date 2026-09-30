import React, { useState, useEffect } from 'react';
import { GhostNodeHeader } from './GhostNodeHeader';
import { FleetList } from './FleetList';
import { LeaseQueuePanel } from './LeaseQueuePanel';
import { RobotDetailModal } from './RobotDetailModal';
import type { Robot, IntersectionLease } from './types';

const SAMPLE_ROBOTS: Robot[] = [
  {
    id: 'amr_01',
    name: 'AMR-01 (Heavy Hauler)',
    online: true,
    state: 'CROSSING',
    batteryPct: 88,
    speedMps: 1.2,
    payloadKg: 45,
    position: { x: 40.2, y: 25.1 },
    leaseStatus: 'HELD',
    leaseNodeId: 'n5',
    wifiIsolated: false,
    cpuPct: 24.8,
    intent: {
      seq: 142,
      fromNode: 'n4',
      toNode: 'n5',
      target: { x: 40, y: 25 },
      headingDeg: 90,
      etaS: 2.1,
      waypoints: [{ x: 40, y: 25, node: 'n5' }]
    },
    peers: [
      { peerId: 'amr_02', distanceM: 3.2, closingSpeedMps: -0.2, lastHeardMs: 120 },
      { peerId: 'amr_03', distanceM: 5.4, closingSpeedMps: 0.1, lastHeardMs: 150 },
    ],
    hazards: [
      { id: 'hz_1', kind: 'BLOCKED_EDGE', location: 'Edge E9', ttlS: 60, ageS: 12, reportedBy: 'amr_01' },
    ],
  },
  {
    id: 'amr_02',
    name: 'AMR-02 (Agile Shuttle)',
    online: true,
    state: 'APPROACHING',
    batteryPct: 74,
    speedMps: 1.1,
    payloadKg: 15,
    position: { x: 40.0, y: 19.5 },
    leaseStatus: 'QUEUED',
    leaseNodeId: 'n5',
    wifiIsolated: false,
    cpuPct: 18.2,
    intent: {
      seq: 110,
      fromNode: 'n2',
      toNode: 'n5',
      target: { x: 40, y: 25 },
      headingDeg: 180,
      etaS: 3.5,
      waypoints: [{ x: 40, y: 25, node: 'n5' }]
    },
    peers: [
      { peerId: 'amr_01', distanceM: 3.2, closingSpeedMps: 0.2, lastHeardMs: 110 },
      { peerId: 'amr_03', distanceM: 8.1, closingSpeedMps: -0.1, lastHeardMs: 200 },
    ],
    hazards: [],
  },
  {
    id: 'amr_03',
    name: 'AMR-03 (Standard Carrier)',
    online: true,
    state: 'YIELDING',
    batteryPct: 62,
    speedMps: 0.0,
    payloadKg: 30,
    position: { x: 48.0, y: 25.0 },
    leaseStatus: 'QUEUED',
    leaseNodeId: 'n5',
    wifiIsolated: false,
    cpuPct: 15.0,
    intent: null,
    peers: [
      { peerId: 'amr_01', distanceM: 5.4, closingSpeedMps: 0.0, lastHeardMs: 180 },
      { peerId: 'amr_02', distanceM: 8.1, closingSpeedMps: 0.1, lastHeardMs: 210 },
    ],
    hazards: [],
  },
  {
    id: 'amr_04',
    name: 'AMR-04 (Tote Runner)',
    online: true,
    state: 'CRUISING',
    batteryPct: 91,
    speedMps: 1.2,
    payloadKg: 10,
    position: { x: 62.0, y: 40.0 },
    leaseStatus: 'NONE',
    leaseNodeId: null,
    wifiIsolated: false,
    cpuPct: 19.5,
    intent: null,
    peers: [],
    hazards: [],
  },
];

const SAMPLE_LEASES: IntersectionLease[] = [
  {
    nodeId: 'n5',
    label: 'Central 4-Way Junction (N5)',
    ttlMs: 2400,
    holder: {
      robotId: 'amr_01',
      role: 'HOLDER',
      bid: { urgency: 0.85, ke: 0.72, waitAgeS: 1.2 },
    },
    queue: [
      {
        robotId: 'amr_02',
        role: 'QUEUED',
        bid: { urgency: 0.65, ke: 0.35, waitAgeS: 2.4 },
      },
      {
        robotId: 'amr_03',
        role: 'QUEUED',
        bid: { urgency: 0.40, ke: 0.20, waitAgeS: 4.8 },
      },
    ],
  },
];

export default function FleetCockpit() {
  const [robots, setRobots] = useState<Robot[]>(SAMPLE_ROBOTS);
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [timelineSeconds, setTimelineSeconds] = useState(14.8);

  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
      setTimelineSeconds((prev) => +(prev + 0.1).toFixed(1));
    }, 100);
    return () => clearInterval(interval);
  }, [isLive]);

  const selectedRobot = robots.find((r) => r.id === selectedRobotId) ?? null;

  const handleToggleWifi = (robotId: string, isolate: boolean) => {
    setRobots((prev) =>
      prev.map((r) => (r.id === robotId ? { ...r, wifiIsolated: isolate } : r))
    );
  };

  const handleKillProcess = (robotId: string) => {
    setRobots((prev) =>
      prev.map((r) =>
        r.id === robotId
          ? r.state === 'FAULT'
            ? { ...r, state: 'CRUISING', speedMps: 1.2, online: true }
            : { ...r, state: 'FAULT', speedMps: 0, online: false }
          : r
      )
    );
  };

  return (
    <div className="space-y-6">
      <GhostNodeHeader
        observerPacketsPublished={0}
        meshState="CONVERGED"
        meshPeerCount={robots.filter((r) => !r.wifiIsolated && r.state !== 'FAULT').length}
        timelineSeconds={timelineSeconds}
        isLive={isLive}
        playbackSpeed={1}
        scenarioName="S-C · Pick-and-Drop 20% Challenge"
        onTogglePlayback={() => setIsLive(!isLive)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-base font-bold text-stone-800 tracking-tight">Fleet Telemetry & Status</h2>
          <FleetList
            robots={robots}
            selectedRobotId={selectedRobotId}
            onInspect={setSelectedRobotId}
            onToggleWifiIsolation={handleToggleWifi}
            onKillProcess={handleKillProcess}
          />
        </div>

        <div className="space-y-4">
          <h2 className="text-base font-bold text-stone-800 tracking-tight">L1 Lease Claims & Ranked Queue</h2>
          <LeaseQueuePanel
            leases={SAMPLE_LEASES}
            onSelectRobot={setSelectedRobotId}
          />
        </div>
      </div>

      <RobotDetailModal
        robot={selectedRobot}
        onClose={() => setSelectedRobotId(null)}
        onToggleWifiIsolation={handleToggleWifi}
        onKillProcess={handleKillProcess}
      />
    </div>
  );
}
