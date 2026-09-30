declare module '*.jsx' {
  const content: any;
  export default content;
  export const LanguageToggle: any;
  export const OfflineIndicator: any;
  export const MeshTopologyPanel: any;
  export const registerServiceWorker: any;
  export const FleetGanttTimeline: any;
  export const SustainabilityPanel: any;
  export const HazardDrawingOverlay: any;
  export const NaturalCommandBar: any;
  export const OrderSlaTracker: any;
  export const WmsTwinStudio: any;
}

declare module './components/blocks/block1/Block1' {
  export const LanguageToggle: any;
  export const OfflineIndicator: any;
  export const MeshTopologyPanel: any;
  export const registerServiceWorker: any;
  const def: any;
  export default def;
}

declare module './components/blocks/block2/SwarmEdgeBlock2' {
  export const FleetGanttTimeline: any;
  export const SustainabilityPanel: any;
  export const useFleetSimulator: any;
  export const computeEnergy: any;
  export const MODEL: any;
  export const STATE_META: any;
  const def: any;
  export default def;
}

declare module './components/blocks/block3/SwarmEdgeBlock3' {
  export const HazardDrawingOverlay: any;
  export const NaturalCommandBar: any;
  const def: any;
  export default def;
}

declare module './components/blocks/block4/WmsTwinStudio' {
  const def: any;
  export default def;
}
