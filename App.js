// Gig Timer - React Native (Expo) App
// Modern File API (SDK 54+): Directory/File for Share & Save
// - Share: cache -> createFile -> write -> Sharing.shareAsync (with runtime guards + RN Share fallback)
// - Save: pickDirectory -> createFile -> write
// UI tweaks retained: white BG, visible placeholders, small gap, bottom safe padding (~8mm)

import React, { useState, useRef, useEffect } from "react";
import {
  SafeAreaView,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Share, // used for fallback text-only sharing
} from "react-native";

// Modern FileSystem API (no legacy)
import { Directory, File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import { TabView, TabBar } from "react-native-tab-view";

const GigTimer = () => {
  const initialLayout = { width: Dimensions.get("window").width };

  const [heats, setHeats] = useState([{ key: "heat1", title: "Heat 1" }]);
  const [index, setIndex] = useState(0);
  const [routes, setRoutes] = useState(heats);
  const [heatData, setHeatData] = useState({
    heat1: {
      raceName: "",
      boats: [],
      newBoatName: "",
      newBoatClub: "",
      results: [],
      tappedBoats: [],
      startTime: null,
      timer: 0,
      lastTap: null,
    },
  });

  const timerRefs = useRef({});

  useEffect(() => {
    return () => {
      Object.values(timerRefs.current).forEach((t) => {
        if (Platform.OS === "web") {
          cancelAnimationFrame(t);
        } else {
          clearInterval(t);
        }
      });
    };
  }, []);

  // Keep other heats' raceName in sync with Heat 1
  useEffect(() => {
    const base = heatData.heat1.raceName;
    setHeatData((prev) => {
      const copy = { ...prev };
      routes.forEach((r) => {
        if (r.key !== "heat1") {
          copy[r.key] = copy[r.key]
            ? { ...copy[r.key], raceName: base }
            : {
                raceName: base,
                boats: [],
                newBoatName: "",
                newBoatClub: "",
                results: [],
                tappedBoats: [],
                timer: 0,
                startTime: null,
                lastTap: null,
              };
        }
      });
      return copy;
    });
  }, [heatData.heat1.raceName, routes]);

  const handleStart = () => {
    const key = routes[index].key;
    if (!heatData[key].startTime) {
      const s = Date.now();
      if (Platform.OS === "web") {
        const loop = () => {
          setHeatData((prev) => ({
            ...prev,
            [key]: { ...prev[key], timer: (Date.now() - s) / 1000 },
          }));
          timerRefs.current[key] = requestAnimationFrame(loop);
        };
        timerRefs.current[key] = requestAnimationFrame(loop);
      } else {
        timerRefs.current[key] = setInterval(() => {
          setHeatData((prev) => ({
            ...prev,
            [key]: { ...prev[key], timer: (Date.now() - s) / 1000 },
          }));
        }, 100);
      }
      setHeatData((prev) => ({
        ...prev,
        [key]: { ...prev[key], startTime: s },
      }));
    }
  };

  const handleStop = () => {
    const key = routes[index].key;
    if (Platform.OS === "web") {
      cancelAnimationFrame(timerRefs.current[key]);
    } else {
      clearInterval(timerRefs.current[key]);
    }
    setHeatData((prev) => ({
      ...prev,
      [key]: { ...prev[key], startTime: null },
    }));
  };

  const handleReset = () => {
    const key = routes[index].key;
    if (Platform.OS === "web") {
      cancelAnimationFrame(timerRefs.current[key]);
    } else {
      clearInterval(timerRefs.current[key]);
    }
    setHeatData((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        results: [],
        tappedBoats: [],
        timer: 0,
        startTime: null,
        lastTap: null,
      },
    }));
  };

  const handleNewRace = () => {
    const key = routes[index].key;
    if (Platform.OS === "web") {
      cancelAnimationFrame(timerRefs.current[key]);
    } else {
      clearInterval(timerRefs.current[key]);
    }
    setHeatData((prev) => ({
      ...prev,
      [key]: {
        raceName: "",
        boats: [],
        newBoatName: "",
        newBoatClub: "",
        results: [],
        tappedBoats: [],
        timer: 0,
        startTime: null,
        lastTap: null,
      },
    }));
  };

  const handleTapBoat = (i) => {
    const key = routes[index].key;
    const h = heatData[key];

    // Guard: race hasn't started or boat already tapped
    if (!h.startTime || h.tappedBoats.includes(i)) return;

    // Prevent accidental double taps within 100ms
    if (Date.now() - (h.lastTapTime || 0) < 100) return;

    // Calculate time since start
    const t = Number(((Date.now() - h.startTime) / 1000).toFixed(1));

    // Add result and sort by time
    const res = [
      ...h.results,
      { idx: i, name: h.boats[i].name, club: h.boats[i].club, time: t },
    ].sort((a, b) => parseFloat(a.time) - parseFloat(b.time));

    setHeatData((prev) => ({
      ...prev,
      [key]: {
        ...h,
        results: res,
        tappedBoats: [...h.tappedBoats, i],
        lastTap: i,
        lastTapTime: Date.now(), 
      },
    }));
  };
  const handleUndo = () => {
    const key = routes[index].key;
    const h = heatData[key];
    if (h.lastTap === null) return;
    const res = h.results.filter((r) => r.idx !== h.lastTap);
    setHeatData((prev) => ({
      ...prev,
      [key]: {
        ...h,
        results: res,
        tappedBoats: h.tappedBoats.filter((i) => i !== h.lastTap),
        lastTap: null,
      },
    }));
  };

  const handleAddBoat = () => {
    const key = routes[index].key;
    const h = heatData[key];
    if (!h.newBoatName.trim()) return;
    setHeatData((prev) => ({
      ...prev,
      [key]: {
        ...h,
        boats: [...h.boats, { name: h.newBoatName, club: h.newBoatClub }],
        newBoatName: "",
        newBoatClub: "",
      },
    }));
  };

  const handleAddHeat = () => {
    const n = heats.length + 1;
    const key = `heat${n}`;
    const newH = { key, title: `Heat ${n}` };
    setHeats((h) => [...h, newH]);
    setRoutes((r) => [...r, newH]);
    setHeatData((d) => ({
      ...d,
      [key]: {
        raceName: heatData.heat1.raceName,
        boats: [],
        newBoatName: "",
        newBoatClub: "",
        results: [],
        tappedBoats: [],
        timer: 0,
        startTime: null,
        lastTap: null,
      },
    }));
  };

  // ----------------------------
  // Copy Results (unchanged)
  // ----------------------------
  const formatText = (res) => {
    const key = routes[index].key;
    const h = heatData[key];
    const head = `Race: ${h.raceName}\nHeat: ${routes[index].title}`;
    const body = res
      .map((e) => `${e.name} (${e.club || ""}) - ${e.time}s`)
      .join("\n");
    return head + "\n" + body;
  };

  const copyRes = (k) => {
    Clipboard.setStringAsync(formatText(heatData[k].results));
    Alert.alert("Results copied");
  };

  // ----------------------------
  // CSV helpers (shared by Share/Save)
  // ----------------------------
  const buildCsvForHeat = (k) => {
    const header = "Race,Heat,Name,Club,Time";
    const heat = heatData[k];
    const heatTitle = routes.find((r) => r.key === k)?.title ?? "";

    const rows = heat.results.map(
      (e) =>
        `${csvQuote(heat.raceName)},${csvQuote(heatTitle)},${csvQuote(e.name)},${csvQuote(e.club || "")},${e.time}`,
    );

    const csv = [header, ...rows].join("\n");
    const fileName = `${k}-results-${Date.now()}.csv`;
    return { csv, fileName };
  };

  function csvQuote(val) {
    const s = String(val ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  // =========================================================
  // === START shareRes (hardened v2) ========================
  // =========================================================
  const shareRes = async (k) => {
    try {
      // Diagnostics to confirm expo-sharing at runtime
      console.log("Sharing module type:", typeof Sharing);
      console.log(
        "Sharing keys:",
        Sharing ? Object.keys(Sharing) : "no module",
      );
      console.log("typeof shareAsync:", Sharing && typeof Sharing.shareAsync);

      if (Platform.OS === "web") {
        const { csv, fileName } = buildCsvForHeat(k);
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();

        URL.revokeObjectURL(url);
        return;
      }
      // Build CSV once (used for both file-based and text fallback)
      const { csv, fileName } = buildCsvForHeat(k);

      // Guard 1: module present + functions exposed
      const hasModule =
        Sharing &&
        typeof Sharing.isAvailableAsync === "function" &&
        typeof Sharing.shareAsync === "function";

      if (!hasModule) {
        // Fallback: React Native text-only share (no file attachment)
        await Share.share({ title: "Gig Timer results", message: csv });
        return;
      }

      // Guard 2: device has share targets for file-based share
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        // Fallback to text-only share
        await Share.share({ title: "Gig Timer results", message: csv });
        return;
      }

      // File-based share path (modern File API)
      const cacheDir = await Directory.cache(); // Directory instance
      const file = await cacheDir.createFile(fileName, "text/csv"); // File instance
      await file.write(csv); // Write text content
      const uri = String(file.uri);

      await Sharing.shareAsync(uri, {
        mimeType: "text/csv",
        dialogTitle: "Share results",
        UTI: "public.comma-separated-values-text",
      });
    } catch (err) {
      console.warn("shareRes error:", err);
      // Last-chance fallback: text-only share
      try {
        const { csv } = buildCsvForHeat(k);
        await Share.share({ title: "Gig Timer results", message: csv });
      } catch (e) {
        Alert.alert("Share failed", String(err?.message ?? err));
      }
    }
  };
  // =========================================================
  // === END shareRes (hardened v2) ==========================
  // =========================================================

  // ----------------------------
  // Save (new File API)
  // ----------------------------
  const saveRes = async (k) => {
    try {
      const { csv, fileName } = buildCsvForHeat(k);

      // Let the user pick a folder (Android/iOS) and then create/write the file there
      const picked = await Directory.pickDirectoryAsync();
      if (!picked) {
        Alert.alert("Save cancelled", "No folder selected.");
        return;
      }

      // picked is a Directory instance; create file inside it
      const target = await picked.createFile(fileName, "text/csv");
      await target.write(csv);

      Alert.alert(
        "Saved",
        `CSV saved to your selected folder.\n\n(${fileName})`,
      );
    } catch (e) {
      console.warn("saveRes error:", e);
      Alert.alert("Save failed", String(e?.message ?? e));
    }
  };

  // ----------------------------
  // Per-heat screen
  // ----------------------------
  const renderScene = ({ route }) => {
    const d = heatData[route.key];

    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={
          Platform.OS === "ios" ? 80 : StatusBar.currentHeight || 0
        }
      >
        <SafeAreaView
          style={[
            styles.safeArea,
            {
              paddingTop:
                Platform.OS === "android" ? StatusBar.currentHeight : 0,
            },
          ]}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
          >
            <TextInput
              style={styles.input}
              placeholder="Race Name"
              placeholderTextColor="#666"
              value={d.raceName}
              onChangeText={(t) =>
                setHeatData((p) => ({
                  ...p,
                  [route.key]: { ...d, raceName: t },
                }))
              }
            />

            <Text style={styles.sub}>Add Boat</Text>

            <TextInput
              style={styles.input}
              placeholder="Boat Name"
              placeholderTextColor="#666"
              value={d.newBoatName}
              onChangeText={(t) =>
                setHeatData((p) => ({
                  ...p,
                  [route.key]: { ...d, newBoatName: t },
                }))
              }
            />

            <View style={styles.rowBoat}>
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 5 }]}
                placeholder="Club Name (optional)"
                placeholderTextColor="#666"
                value={d.newBoatClub}
                onChangeText={(t) =>
                  setHeatData((p) => ({
                    ...p,
                    [route.key]: { ...d, newBoatClub: t },
                  }))
                }
              />
              <TouchableOpacity
                style={[styles.button, { flex: 1 }]}
                onPress={handleAddBoat}
              >
                <Text style={styles.btnText}>Add Boat</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.timer}>{d.timer.toFixed(1)}s</Text>

            <View style={styles.rowBig}>
              <TouchableOpacity
                style={[styles.halfButtonBig, { marginRight: 5 }]}
                onPress={handleStart}
              >
                <Text style={styles.btnText}>Start</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.halfButtonBig,
                  { backgroundColor: "red", marginLeft: 5 },
                ]}
                onPress={handleStop}
              >
                <Text style={styles.btnText}>Stop</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: "#fb8c00" }]}
              onPress={handleUndo}
            >
              <Text style={styles.btnText}>Undo Last Tap</Text>
            </TouchableOpacity>

            <View style={styles.rowSmall}>
              <TouchableOpacity
                style={[styles.yellowButton, { marginRight: 5 }]}
                onPress={handleReset}
              >
                <Text style={styles.btnText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.yellowButton, { marginLeft: 5 }]}
                onPress={handleNewRace}
              >
                <Text style={styles.btnText}>New Race</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.noteText}>
              Tap boat buttons below as boats cross finish line
            </Text>

            <View style={styles.boatContainer}>
              {d.boats.map((b, i) => (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.boatButton,
                    d.tappedBoats.includes(i) ? styles.boatTapped : null,
                  ]}
                  onPress={() => handleTapBoat(i)}
                >
                  <Text style={styles.boatText}>
                    {b.name}
                    {b.club ? ` (${b.club})` : ""}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sub}>Results</Text>

            {/* Three buttons in one row: Copy | Share | Save */}
            <View style={styles.exportRow}>
              <TouchableOpacity
                style={styles.thirdButton}
                onPress={() => copyRes(route.key)}
              >
                <Text style={styles.btnText}>Copy</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.thirdButton}
                onPress={() => shareRes(route.key)}
              >
                <Text style={styles.btnText}>Share</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.thirdButton}
                onPress={() => {
                  if (Platform.OS === "web") {
                    shareRes(route.key);
                  } else {
                    saveRes(route.key);
                  }
                }}
              >
                <Text style={styles.btnText}>Save</Text>
              </TouchableOpacity>
            </View>

            {d.results.map((r, i) => (
              <Text key={i}>
                {i + 1}. {r.name} ({r.club}) - {r.time}s
              </Text>
            ))}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    );
  };

  return (
    <SafeAreaView style={styles.appSafeArea}>
      {/* Dark icons on a light background */}
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#FFFFFF"
        translucent={false}
      />

      {/* + Add Heat */}
      <TouchableOpacity
        style={[
          styles.addHeat,
          styles.addHeatSpacing,
          {
            marginTop:
              Platform.OS === "android"
                ? (StatusBar.currentHeight || 0) + 5
                : 5,
          },
        ]}
        onPress={handleAddHeat}
      >
        <Text style={styles.addHeatText}>+ Add Heat</Text>
      </TouchableOpacity>

      {/* Tabs (Heat 1, Heat 2, ...) */}
      <TabView
        navigationState={{ index, routes }}
        renderScene={renderScene}
        onIndexChange={setIndex}
        initialLayout={initialLayout}
        renderTabBar={(props) => (
          <TabBar
            {...props}
            indicatorStyle={{ backgroundColor: "white" }}
            labelStyle={styles.tabLabel}
            style={styles.tabBar}
          />
        )}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // Force white at the very top/root
  appSafeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  // Screen-level safe area: keep your border + force white
  safeArea: {
    flex: 1,
    borderBottomWidth: 8,
    borderColor: "#ccc",
    backgroundColor: "#FFFFFF",
  },

  // Ensure the ScrollView itself paints white
  scroll: {
    backgroundColor: "#FFFFFF",
  },

  // Content padding (force white + bottom safe space ≈ 8mm)
  container: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    paddingBottom: 56,
  },

  title: {
    position: "absolute",
    top: Platform.OS === "android" ? StatusBar.currentHeight : 0,
    alignSelf: "center",
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },

  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    marginBottom: 10,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
    color: "#111",
  },

  sub: { fontSize: 18, fontWeight: "bold", marginVertical: 10 },
  rowBoat: { flexDirection: "row", marginBottom: 10 },
  button: {
    backgroundColor: "#4CAF50",
    padding: 10,
    borderRadius: 5,
    alignItems: "center",
    marginVertical: 5,
  },

  // + Add Heat button styles + small gap under it
  addHeat: { backgroundColor: "#6200ee", padding: 10, alignItems: "center" },
  addHeatSpacing: { marginBottom: 5 },

  addHeatText: { color: "white", fontWeight: "bold" },

  halfButtonBig: {
    flex: 1,
    padding: 15,
    borderRadius: 5,
    backgroundColor: "#4CAF50",
  },
  rowBig: { flexDirection: "row", marginVertical: 10 },
  yellowButton: {
    flex: 1,
    padding: 10,
    borderRadius: 5,
    backgroundColor: "#fbc02d",
  },
  timer: { fontSize: 24, textAlign: "center", marginVertical: 10 },
  rowSmall: { flexDirection: "row", marginBottom: 10 },
  noteText: {
    fontSize: 12,
    color: "#333",
    marginBottom: 10,
    textAlign: "center",
  },

  boatContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  boatButton: {
    backgroundColor: "#2196F3",
    padding: 10,
    borderRadius: 5,
    width: "48%",
    marginVertical: 4,
    alignItems: "center",
  },
  boatTapped: { backgroundColor: "#585858" },
  boatText: { color: "white", fontSize: 16 },

  // Three slimmer buttons in one row
  exportRow: {
    flexDirection: "row",
    marginVertical: 10,
    alignItems: "stretch",
  },
  thirdButton: {
    flex: 1,
    backgroundColor: "#4CAF50",
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 5,
    marginHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
  },

  tabBar: { backgroundColor: "#6200ee", height: 60 },
  btnText: { color: "white", fontWeight: "bold", textAlign: "center" },
  tabLabel: { fontSize: 16, color: "white" },
});

export default GigTimer;
