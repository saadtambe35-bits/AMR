// Zero-dependency i18n: en / hi / mr. Works without a Provider (module-level store).
import { useCallback, useSyncExternalStore } from "react";

export const load = (k, d) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; }
};
export const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota/private mode */ } };

export const LANGS = [
  { code: "en", name: "English" },
  { code: "hi", name: "हिन्दी" },
  { code: "mr", name: "मराठी" },
];

export const DICT = {
  en: {
    language: "Language", robotStatus: "Robot Status", activeLeases: "Active Leases", contention: "Contention",
    faults: "Faults", battery: "Battery", orderStatus: "Order Status", emergencyStop: "Emergency Stop",
    meshTopology: "Live Mesh Topology", simulatePartition: "Simulate Network Partition",
    clusterAlpha: "Cluster Alpha", clusterBeta: "Cluster Beta", unifiedMesh: "Unified Mesh",
    meshHealthy: "Mesh healthy", partitioned: "Network partitioned", noCloud: "No cloud · no central server",
    localResolution: "Autonomous local conflict resolution", resolved: "Resolved", arbiter: "Local arbiter",
    coordinator: "Central coordinator: none", latency: "Latency", packetLoss: "Packet loss",
    lastSeen: "last_seen", ago: "ago", severed: "link severed", online: "Online",
    offline: "Offline · running on edge",
  },
  hi: {
    language: "भाषा", robotStatus: "रोबोट स्थिति", activeLeases: "सक्रिय लीज़", contention: "टकराव",
    faults: "खराबियाँ", battery: "बैटरी", orderStatus: "ऑर्डर स्थिति", emergencyStop: "आपातकालीन स्टॉप",
    meshTopology: "लाइव मेश नेटवर्क", simulatePartition: "नेटवर्क विभाजन सिमुलेट करें",
    clusterAlpha: "क्लस्टर अल्फा", clusterBeta: "क्लस्टर बीटा", unifiedMesh: "एकीकृत मेश",
    meshHealthy: "मेश सामान्य", partitioned: "नेटवर्क विभाजित", noCloud: "कोई क्लाउड नहीं · कोई केंद्रीय सर्वर नहीं",
    localResolution: "स्वायत्त स्थानीय टकराव समाधान", resolved: "सुलझे", arbiter: "स्थानीय मध्यस्थ",
    coordinator: "केंद्रीय समन्वयक: कोई नहीं", latency: "विलंबता", packetLoss: "पैकेट हानि",
    lastSeen: "अंतिम संकेत", ago: "पहले", severed: "लिंक टूटा", online: "ऑनलाइन",
    offline: "ऑफ़लाइन · एज पर चालू",
  },
  mr: {
    language: "भाषा", robotStatus: "रोबोट स्थिती", activeLeases: "सक्रिय लीज", contention: "संघर्ष",
    faults: "बिघाड", battery: "बॅटरी", orderStatus: "ऑर्डर स्थिती", emergencyStop: "आपत्कालीन थांबा",
    meshTopology: "लाइव्ह मेश नेटवर्क", simulatePartition: "नेटवर्क विभाजन सिम्युलेट करा",
    clusterAlpha: "क्लस्टर अल्फा", clusterBeta: "क्लस्टर बीटा", unifiedMesh: "एकत्रित मेश",
    meshHealthy: "मेश सुस्थितीत", partitioned: "नेटवर्क विभागले", noCloud: "क्लाउड नाही · केंद्रीय सर्व्हर नाही",
    localResolution: "स्वायत्त स्थानिक संघर्ष निराकरण", resolved: "सोडवले", arbiter: "स्थानिक मध्यस्थ",
    coordinator: "केंद्रीय समन्वयक: नाही", latency: "विलंब", packetLoss: "पॅकेट हानी",
    lastSeen: "शेवटचा संकेत", ago: "पूर्वी", severed: "लिंक तुटली", online: "ऑनलाइन",
    offline: "ऑफलाइन · एजवर चालू",
  },
};

let lang = load("se.lang", "en");
if (!DICT[lang]) lang = "en";
const subs = new Set();
if (typeof document !== "undefined") document.documentElement.lang = lang;

export const setLang = (l) => {
  if (!DICT[l]) return;
  lang = l; save("se.lang", l);
  if (typeof document !== "undefined") document.documentElement.lang = l;
  subs.forEach((f) => f());
};
export const useLang = () =>
  useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => lang, () => "en");

/** const t = useT(); t("robotStatus") — falls back to English, then the key. */
export function useT() {
  const l = useLang();
  return useCallback((k) => DICT[l]?.[k] ?? DICT.en[k] ?? k, [l]);
}
