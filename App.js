import React, { useEffect, useRef, useState } from 'react';
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
  Share,
} from 'react-native';

import { Directory } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { TabView } from 'react-native-tab-view';

const GigTimer = () => {
  const initialLayout = { width: Dimensions.get('window').width };

  const [heats, setHeats] = useState([{ key: 'heat1', title: 'Heat 1' }]);
  const [index, setIndex] = useState(0);
  const [routes, setRoutes] = useState(heats);

  const [heatData, setHeatData] = useState({
    heat1: {
      raceName: '',
      boats: [],
      newBoatName: '',
      newBoatClub: '',
      results: [],         // [{ idx, name, club, timeSec }]
      tappedBoats: [],
      startTime: null,
      timer: 0,
      lastTap: null,
    },
  });

  const timerRefs = useRef({});

  // Keep other heats' raceName in sync with Heat 1
  useEffect(() => {
    const base = heatData.heat1?.raceName ?? '';
    setHeatData(prev => {
      const copy = { ...prev };
      routes.forEach(r => {
        if (r.key !== 'heat1') {
          copy[r.key] = copy[r.key]
            ? { ...copy[r.key], raceName: base }
            : {
                raceName: base,
                boats: [],
                newBoatName: '',
                newBoatClub: '',
                results: [],
                tappedBoats: [],
                startTime: null,
                timer: 0,
                lastTap: null,
              };
        }
      });
      return copy;
    });
  }, [heatData.heat1?.raceName, routes]);

  const currentKey = routes[index]?.key ?? 'heat1';

  const handleStart = () => {
    const key = currentKey;
    if (!heatData[key]?.startTime) {
      const s = Date.now();
      timerRefs.current[key] = setInterval(() => {
        setHeatData(prev => ({
          ...prev,
          [key]: { ...prev[key], timer: (Date.now() - s) / 1000 },
        }));
      }, 100);
      setHeatData(prev => ({ ...prev, [key]: { ...prev[key], startTime: s } }));
    }
  };

  const handleStop = () => {
    const key = currentKey;
    clearInterval(timerRefs.current[key]);
    setHeatData(prev => ({ ...prev, [key]: { ...prev[key], startTime: null } }));
  };

  const handleReset = () => {
    const key = currentKey;
    clearInterval(timerRefs.current[key]);
    setHeatData(prev => ({
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
    const key = currentKey;
    clearInterval(timerRefs.current[key]);
    setHeatData(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        raceName: '',
        boats: [],
        newBoatName: '',
        newBoatClub: '',
        results: [],
        tappedBoats: [],
        timer: 0,
        startTime: null,
        lastTap: null,
      },
    }));
  };

  const handleTapBoat = (i) => {
    const key = currentKey;
    const h = heatData[key];
    if (!h.startTime || h.tappedBoats.includes(i)) return;

    const elapsedSec = Number(((Date.now() - h.startTime) / 1000).toFixed(1));
    const entry = { idx: i, name: h.boats[i].name, club: h.boats[i].club, timeSec: elapsedSec };

    const res = [...h.results, entry].sort((a, b) => a.timeSec - b.timeSec);

    setHeatData(prev => ({
      ...prev,
      [key]: { ...h, results: res, tappedBoats: [...h.tappedBoats, i], lastTap: i },
    }));
  };

  const handleUndo = () => {
    const key = currentKey;
    const h = heatData[key];
    if (h.lastTap === null) return;

    const res = h.results.filter(r => r.idx !== h.lastTap);
    setHeatData(prev => ({
      ...prev,
      [key]: {
        ...h,
        results: res,
        tappedBoats: h.tappedBoats.filter(i => i !== h.lastTap),
        lastTap: null,
      },
    }));
  };

  const handleAddBoat = () => {
    const key = currentKey;
    const h = heatData[key];

    const name = (h.newBoatName || '').trim();
    if (!name) return;
    const club = (h.newBoatClub || '').trim();

    const nextBoats = [...h.boats, { name, club }].sort((a, b) =>
      a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
    );

    setHeatData(prev => ({
      ...prev,
      [key]: { ...h, boats: nextBoats, newBoatName: '', newBoatClub: '' },
    }));
  };

  const handleAddHeat = () => {
    const n = heats.length + 1;
    const key = `heat${n}`;
    const newH = { key, title: `Heat ${n}` };

    setHeats(h => [...h, newH]);
    setRoutes(r => [...r, newH]);

    setHeatData(d => ({
      ...d,
      [key]: {
        raceName: d.heat1?.raceName || '',
        boats: [],
        newBoatName: '',
        newBoatClub: '',
        results: [],
        tappedBoats: [],
        timer: 0,
        startTime: null,
        lastTap: null,
      },
    }));
  };

  // NEW: Reset Heats (keep Heat 1 only)
  const handleResetHeats = () => {
    // stop all timers
    Object.values(timerRefs.current).forEach(t => t && clearInterval(t));

    setHeats([{ key: 'heat1', title: 'Heat 1' }]);
    setRoutes([{ key: 'heat1', title: 'Heat 1' }]);
    setIndex(0);

    // keep heat1 data as-is; remove others
    setHeatData(prev => ({ heat1: prev.heat1 }));
  };

  // Copy results: include positions + mm:ss.s
  const formatText = (res, k) => {
    const h = heatData[k];
    const heatTitle = routes[index]?.title ?? '';
    const head = `Race: ${h.raceName}\nHeat: ${heatTitle}`;
    const body = res
      .map((e, i) =>
        `${i + 1}. ${e.name}${e.club ? ` (${e.club})` : ''} - ${formatTime(e.timeSec)}`
      )
      .join('\n');
    return head + '\n' + body;
  };

  const copyRes = (k) => {
    Clipboard.setStringAsync(formatText(heatData[k].results, k));
    Alert.alert('Results copied');
  };

  // TSV export (tab-separated) + NEW filename includes race + heat
  const buildTsvForHeat = (k) => {
    const heat = heatData[k];
    const heatTitle = routes.find(r => r.key === k)?.title ?? '';
    const race = heat.raceName ?? '';

    const header = 'Race\tHeat\tPos\tName\tClub\tTime';
    const rows = heat.results.map((e, i) =>
      `${tsvQuote(race)}\t${tsvQuote(heatTitle)}\t${i + 1}\t${tsvQuote(e.name)}\t${tsvQuote(e.club || '')}\t${formatTime(e.timeSec)}`
    );

    const tsv = [header, ...rows].join('\n');

    const safeRace = safeFilePart(race);
    const safeHeat = safeFilePart(heatTitle);
    const stamp = timeStampForFile();

    const fileName = `results_${safeRace}_${safeHeat}_${stamp}.tsv`;
    return { tsv, fileName };
  };

  function tsvQuote(val) {
    const s = String(val ?? '');
    if (/[\t"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function safeFilePart(s) {
    const base = String(s || '').trim() || 'Unknown';
    return base
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '') // illegal filename chars
      .replace(/\s+/g, '_')
      .slice(0, 24);
  }

  function timeStampForFile() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  // Share (file if available; fallback to text)
  const shareRes = async (k) => {
    try {
      const { tsv, fileName } = buildTsvForHeat(k);

      const hasModule =
        Sharing &&
        typeof Sharing.isAvailableAsync === 'function' &&
        typeof Sharing.shareAsync === 'function';

      if (!hasModule) {
        await Share.share({ title: 'Results', message: tsv });
        return;
      }

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        await Share.share({ title: 'Results', message: tsv });
        return;
      }

      const cacheDir = await Directory.cache();
      const file = await cacheDir.createFile(fileName, 'text/tab-separated-values');
      await file.write(tsv);

      await Sharing.shareAsync(String(file.uri), {
        mimeType: 'text/tab-separated-values',
        dialogTitle: 'Share results',
        UTI: 'public.tab-separated-values-text',
      });
    } catch (err) {
      console.warn('shareRes error:', err);
      try {
        const { tsv } = buildTsvForHeat(k);
        await Share.share({ title: 'Results', message: tsv });
      } catch {
        Alert.alert('Share failed', String(err?.message ?? err));
      }
    }
  };

  // Save (pick folder -> write TSV)
  const saveRes = async (k) => {
    try {
      const { tsv, fileName } = buildTsvForHeat(k);
      const picked = await Directory.pickDirectoryAsync();
      if (!picked) {
        Alert.alert('Save cancelled', 'No folder selected.');
        return;
      }
      const target = await picked.createFile(fileName, 'text/tab-separated-values');
      await target.write(tsv);
      Alert.alert('Saved', `Results saved:\n${fileName}`);
    } catch (e) {
      console.warn('saveRes error:', e);
      Alert.alert('Save failed', String(e?.message ?? e));
    }
  };

  // --- Custom Tab Bar (thin white border, thick on selected) + Add/Reset buttons below ---
  const renderTabBar = (props) => {
    const { navigationState, jumpTo } = props;
    return (
      <View style={styles.tabBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
        >
          {navigationState.routes.map((r, i) => {
            const focused = i === navigationState.index;
            return (
              <TouchableOpacity
                key={r.key}
                onPress={() => jumpTo(r.key)}
                style={[styles.tabPill, focused ? styles.tabPillActive : styles.tabPillInactive]}
              >
                <Text style={styles.tabLabel}>{r.title}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Add Heat + Reset Heats row (below tabs) */}
        <View style={styles.heatControlsRow}>
          <TouchableOpacity style={[styles.heatControlBtn, styles.heatControlLeft]} onPress={handleAddHeat}>
            <Text style={styles.btnText}>+ Add Heat</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.heatControlBtn, styles.heatControlRight]} onPress={handleResetHeats}>
            <Text style={styles.btnText}>Reset Heats</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderScene = ({ route }) => {
    const d = heatData[route.key];

    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : StatusBar.currentHeight || 0}
      >
        <SafeAreaView style={[styles.safeArea, { paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 }]}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
          >
            {/* 3) Race label above the Race Name row */}
            <Text style={styles.sub}>Race</Text>

            {/* 6) Race Name row with New Race button on right (¼ width) */}
            <View style={styles.raceRow}>
              <TextInput
                style={[styles.input, styles.raceInput]}
                placeholder="Race Name"
                placeholderTextColor="#666"
                value={d.raceName}
                onChangeText={t => setHeatData(p => ({ ...p, [route.key]: { ...d, raceName: t } }))}
              />
              <TouchableOpacity style={styles.newRaceBtn} onPress={handleNewRace}>
                <Text style={styles.btnText}>New Race</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sub}>Add Boat</Text>

            <TextInput
              style={styles.input}
              placeholder="Boat Name"
              placeholderTextColor="#666"
              value={d.newBoatName}
              onChangeText={t => setHeatData(p => ({ ...p, [route.key]: { ...d, newBoatName: t } }))}
            />

            {/* 5) Align Add Boat button to Club input (fixed by removing vertical margin + centering row) */}
            <View style={styles.rowBoat}>
              <TextInput
                style={[styles.input, styles.clubInput]}
                placeholder="Club Name (optional)"
                placeholderTextColor="#666"
                value={d.newBoatClub}
                onChangeText={t => setHeatData(p => ({ ...p, [route.key]: { ...d, newBoatClub: t } }))}
              />
              <TouchableOpacity style={styles.addBoatBtnInline} onPress={handleAddBoat}>
                <Text style={styles.btnText}>Add Boat</Text>
              </TouchableOpacity>
            </View>

            {/* 4) Bigger timer */}
            <Text style={styles.timer}>{formatTime(d.timer)}</Text>

            <View style={styles.rowBig}>
              <TouchableOpacity style={[styles.halfButtonBig, { marginRight: 5 }]} onPress={handleStart}>
                <Text style={styles.btnText}>Start</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.halfButtonBig, { backgroundColor: 'red', marginLeft: 5 }]} onPress={handleStop}>
                <Text style={styles.btnText}>Stop</Text>
              </TouchableOpacity>
            </View>

            {/* 7) Undo + Reset in one row, each half width */}
            <View style={styles.rowUndoReset}>
              <TouchableOpacity style={[styles.halfActionBtn, { backgroundColor: '#fb8c00', marginRight: 6 }]} onPress={handleUndo}>
                <Text style={styles.btnText}>Undo Last Tap</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.halfActionBtn, { backgroundColor: '#fbc02d', marginLeft: 6 }]} onPress={handleReset}>
                <Text style={styles.btnText}>Reset</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.noteText}>Tap boat buttons below as boats cross finish line</Text>

            <View style={styles.boatContainer}>
              {d.boats.map((b, i) => (
                <TouchableOpacity
                  key={`${b.name}-${i}`}
                  style={[styles.boatButton, d.tappedBoats.includes(i) ? styles.boatTapped : null]}
                  onPress={() => handleTapBoat(i)}
                >
                  <Text style={styles.boatText}>
                    {b.name}{b.club ? ` (${b.club})` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sub}>Results</Text>

            <View style={styles.exportRow}>
              <TouchableOpacity style={styles.thirdButton} onPress={() => copyRes(route.key)}>
                <Text style={styles.btnText}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.thirdButton} onPress={() => shareRes(route.key)}>
                <Text style={styles.btnText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.thirdButton} onPress={() => saveRes(route.key)}>
                <Text style={styles.btnText}>Save</Text>
              </TouchableOpacity>
            </View>

            {d.results.map((r, i) => (
              <Text key={`${r.idx}-${i}`}>
                {i + 1}. {r.name}{r.club ? ` (${r.club})` : ''} - {formatTime(r.timeSec)}
              </Text>
            ))}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    );
  };

  return (
    <SafeAreaView style={styles.appSafeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={false} />

      <TabView
        navigationState={{ index, routes }}
        renderScene={renderScene}
        onIndexChange={setIndex}
        initialLayout={initialLayout}
        renderTabBar={renderTabBar}   {/* (1)(2) custom tabs + buttons below */}
      />
    </SafeAreaView>
  );
};

// mm:ss.s formatting (0.1s)
function formatTime(sec) {
  const total = Number(sec) || 0;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  const sFixed = (Math.round(s * 10) / 10).toFixed(1);
  const mm = String(m).padStart(2, '0');
  const ss = Number(sFixed) < 10 ? `0${sFixed}` : sFixed;
  return `${mm}:${ss}`;
}

const styles = StyleSheet.create({
  appSafeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { backgroundColor: '#FFFFFF' },
  container: { padding: 16, backgroundColor: '#FFFFFF', paddingBottom: 56 },

  // --- Tab header + controls ---
  tabBarContainer: {
    backgroundColor: '#6200ee',
    paddingTop: 6,
    paddingBottom: 10,
  },
  tabRow: {
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 8,
  },
  tabPill: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#6200ee',
  },
  tabPillInactive: {
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  tabPillActive: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  tabLabel: { fontSize: 16, color: '#FFFFFF', fontWeight: '700' },

  heatControlsRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    marginTop: 10,
  },
  heatControlBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
  },
  heatControlLeft: { marginRight: 6 },
  heatControlRight: { marginLeft: 6, backgroundColor: '#fb8c00' },

  // --- Inputs / labels ---
  sub: { fontSize: 18, fontWeight: 'bold', marginVertical: 10, color: '#111' },

  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    color: '#111',
    marginBottom: 10,
  },

  // 6) Race row (input + button)
  raceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  raceInput: { flex: 3, marginBottom: 0, marginRight: 10 },
  newRaceBtn: {
    flex: 1,
    backgroundColor: '#fbc02d',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 5) Club + Add Boat aligned
  rowBoat: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  clubInput: { flex: 1, marginBottom: 0, marginRight: 10 },
  addBoatBtnInline: {
    width: 130,
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 4) Bigger timer
  timer: { fontSize: 28, textAlign: 'center', marginVertical: 12, fontWeight: '700', color: '#111' },

  rowBig: { flexDirection: 'row', marginVertical: 10 },
  halfButtonBig: { flex: 1, padding: 15, borderRadius: 5, backgroundColor: '#4CAF50', alignItems: 'center' },

  // 7) Undo + Reset row
  rowUndoReset: { flexDirection: 'row', marginTop: 6, marginBottom: 8 },
  halfActionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },

  noteText: { fontSize: 12, color: '#333', marginBottom: 10, textAlign: 'center' },

  boatContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  boatButton: { backgroundColor: '#2196F3', padding: 10, borderRadius: 5, width: '48%', marginVertical: 4, alignItems: 'center' },
  boatTapped: { backgroundColor: '#585858' },
  boatText: { color: 'white', fontSize: 16 },

  exportRow: { flexDirection: 'row', marginVertical: 10, alignItems: 'stretch' },
  thirdButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 5,
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },

  btnText: { color: 'white', fontWeight: 'bold', textAlign: 'center' },
});

export default GigTimer;