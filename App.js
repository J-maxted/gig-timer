// Gig Timer - React Native (Expo) App
// Fix included: restore handleAddHeat (was crashing the app)

import React, { useState, useRef, useEffect } from 'react';
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
  Share, // fallback text-only sharing
} from 'react-native';

// Modern FileSystem API (SDK 54+)
import { Directory } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { TabView, TabBar } from 'react-native-tab-view';

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
      results: [],
      tappedBoats: [],
      startTime: null,
      timer: 0,
      lastTap: null
    },
  });

  const timerRefs = useRef({});

  // Keep other heats' raceName in sync with Heat 1
  useEffect(() => {
    const base = heatData.heat1.raceName;
    setHeatData(prev => {
      const copy = { ...prev };
      routes.forEach(r => {
        if (r.key !== 'heat1') {
          copy[r.key] = copy[r.key]
            ? { ...copy[r.key], raceName: base }
            : { raceName: base, boats: [], newBoatName: '', newBoatClub: '', results: [], tappedBoats: [], timer: 0, startTime: null, lastTap: null };
        }
      });
      return copy;
    });
  }, [heatData.heat1.raceName, routes]);

  const handleStart = () => {
    const key = routes[index].key;
    if (!heatData[key].startTime) {
      const s = Date.now();
      timerRefs.current[key] = setInterval(() => {
        setHeatData(prev => ({
          ...prev,
          [key]: { ...prev[key], timer: (Date.now() - s) / 1000 }
        }));
      }, 100);
      setHeatData(prev => ({ ...prev, [key]: { ...prev[key], startTime: s } }));
    }
  };

  const handleStop = () => {
    const key = routes[index].key;
    clearInterval(timerRefs.current[key]);
    setHeatData(prev => ({ ...prev, [key]: { ...prev[key], startTime: null } }));
  };

  const handleReset = () => {
    const key = routes[index].key;
    clearInterval(timerRefs.current[key]);
    setHeatData(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        results: [],
        tappedBoats: [],
        timer: 0,
        startTime: null,
        lastTap: null
      }
    }));
  };

  const handleNewRace = () => {
    const key = routes[index].key;
    clearInterval(timerRefs.current[key]);
    setHeatData(prev => ({
      ...prev,
      [key]: {
        raceName: '',
        boats: [],
        newBoatName: '',
        newBoatClub: '',
        results: [],
        tappedBoats: [],
        timer: 0,
        startTime: null,
        lastTap: null
      }
    }));
  };

  const handleTapBoat = i => {
    const key = routes[index].key;
    const h = heatData[key];
    if (!h.startTime || h.tappedBoats.includes(i)) return;

    const t = Number(((Date.now() - h.startTime) / 1000).toFixed(1));
    const entry = { idx: i, name: h.boats[i].name, club: h.boats[i].club, timeSec: t };

    const res = [...h.results, entry].sort((a, b) => a.timeSec - b.timeSec);
    setHeatData(prev => ({
      ...prev,
      [key]: { ...h, results: res, tappedBoats: [...h.tappedBoats, i], lastTap: i }
    }));
  };

  const handleUndo = () => {
    const key = routes[index].key;
    const h = heatData[key];
    if (h.lastTap === null) return;
    const res = h.results.filter(r => r.idx !== h.lastTap);
    setHeatData(prev => ({
      ...prev,
      [key]: {
        ...h,
        results: res,
        tappedBoats: h.tappedBoats.filter(i => i !== h.lastTap),
        lastTap: null
      }
    }));
  };

  const handleAddBoat = () => {
    const key = routes[index].key;
    const h = heatData[key];
    const name = (h.newBoatName || '').trim();
    if (!name) return;
    const club = (h.newBoatClub || '').trim();

    const nextBoats = [...h.boats, { name, club }].sort((a, b) =>
      a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
    );

    setHeatData(prev => ({
      ...prev,
      [key]: { ...h, boats: nextBoats, newBoatName: '', newBoatClub: '' }
    }));
  };

  // ----------------------------
  // ✅ FIX: handleAddHeat (missing -> crash)
  // Place inside GigTimer, ABOVE the return.
  // ----------------------------
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
      }
    }));
  };

  // ----------------------------
  // Copy Results
  // ----------------------------
  const formatText = (res, k) => {
    const h = heatData[k];
    const heatTitle = routes[index]?.title ?? '';
    const head = `Race: ${h.raceName}\nHeat: ${heatTitle}`;
    const body = res.map((e, i) => `${i + 1}. ${e.name}${e.club ? ` (${e.club})` : ''} - ${formatTime(e.timeSec)}`).join('\n');
    return head + '\n' + body;
  };

  const copyRes = k => {
    Clipboard.setStringAsync(formatText(heatData[k].results, k));
    Alert.alert('Results copied');
  };

  // TSV export
  const buildTsvForHeat = (k) => {
    const header = 'Race\tHeat\tPos\tName\tClub\tTime';
    const heat = heatData[k];
    const heatTitle = routes[index]?.title ?? '';
    const rows = heat.results.map((e, i) =>
      `${tsvQuote(heat.raceName)}\t${tsvQuote(heatTitle)}\t${i + 1}\t${tsvQuote(e.name)}\t${tsvQuote(e.club || '')}\t${formatTime(e.timeSec)}`
    );
    const tsv = [header, ...rows].join('\n');
    const fileName = `${k}-results-${Date.now()}.tsv`;
    return { tsv, fileName };
  };

  function tsvQuote(val) {
    const s = String(val ?? '');
    if (/[\t"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  // Share (file-based if possible; fallback to text)
  const shareRes = async (k) => {
    try {
      console.log('Sharing module type:', typeof Sharing);
      console.log('Sharing keys:', Sharing ? Object.keys(Sharing) : 'no module');
      console.log('typeof shareAsync:', Sharing && typeof Sharing.shareAsync);

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
            <TextInput
              style={styles.input}
              placeholder="Race Name"
              placeholderTextColor="#666"
              value={d.raceName}
              onChangeText={t => setHeatData(p => ({ ...p, [route.key]: { ...d, raceName: t } }))}
            />

            <Text style={styles.sub}>Add Boat</Text>

            <TextInput
              style={styles.input}
              placeholder="Boat Name"
              placeholderTextColor="#666"
              value={d.newBoatName}
              onChangeText={t => setHeatData(p => ({ ...p, [route.key]: { ...d, newBoatName: t } }))}
            />

            <View style={styles.rowBoat}>
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 5 }]}
                placeholder="Club Name (optional)"
                placeholderTextColor="#666"
                value={d.newBoatClub}
                onChangeText={t => setHeatData(p => ({ ...p, [route.key]: { ...d, newBoatClub: t } }))}
              />
              <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={handleAddBoat}>
                <Text style={styles.btnText}>Add Boat</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.timer}>{formatTime(d.timer)}</Text>

            <View style={styles.rowBig}>
              <TouchableOpacity style={[styles.halfButtonBig, { marginRight: 5 }]} onPress={handleStart}>
                <Text style={styles.btnText}>Start</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.halfButtonBig, { backgroundColor: 'red', marginLeft: 5 }]} onPress={handleStop}>
                <Text style={styles.btnText}>Stop</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.button, { backgroundColor: '#fb8c00' }]} onPress={handleUndo}>
              <Text style={styles.btnText}>Undo Last Tap</Text>
            </TouchableOpacity>

            <View style={styles.rowSmall}>
              <TouchableOpacity style={[styles.yellowButton, { marginRight: 5 }]} onPress={handleReset}>
                <Text style={styles.btnText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.yellowButton, { marginLeft: 5 }]} onPress={handleNewRace}>
                <Text style={styles.btnText}>New Race</Text>
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

      {/* + Add Heat with tiny gap above tabs */}
      <TouchableOpacity
        style={[styles.addHeat, styles.addHeatSpacing, { marginTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 5 : 5 }]}
        onPress={handleAddHeat}
      >
        <Text style={styles.addHeatText}>+ Add Heat</Text>
      </TouchableOpacity>

      <TabView
        navigationState={{ index, routes }}
        renderScene={renderScene}
        onIndexChange={setIndex}
        initialLayout={initialLayout}
        renderTabBar={props => (
          <TabBar
            {...props}
            indicatorStyle={{ backgroundColor: 'white' }}
            labelStyle={styles.tabLabel}
            style={styles.tabBar}
          />
        )}
      />
    </SafeAreaView>
  );
};

// Time formatting: mm:ss.s (0.1s)
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
  safeArea: { flex: 1, borderBottomWidth: 8, borderColor: '#ccc', backgroundColor: '#FFFFFF' },
  scroll: { backgroundColor: '#FFFFFF' },
  container: { padding: 16, backgroundColor: '#FFFFFF', paddingBottom: 56 },

  input: {
    borderWidth: 1, borderColor: '#ccc', padding: 10, marginBottom: 10, borderRadius: 5,
    backgroundColor: '#FFFFFF', color: '#111'
  },
  sub: { fontSize: 18, fontWeight: 'bold', marginVertical: 10 },
  rowBoat: { flexDirection: 'row', marginBottom: 10 },
  button: { backgroundColor: '#4CAF50', padding: 10, borderRadius: 5, alignItems: 'center', marginVertical: 5 },

  addHeat: { backgroundColor: '#6200ee', padding: 10, alignItems: 'center' },
  addHeatSpacing: { marginBottom: 5 },
  addHeatText: { color: 'white', fontWeight: 'bold' },

  halfButtonBig: { flex: 1, padding: 15, borderRadius: 5, backgroundColor: '#4CAF50' },
  rowBig: { flexDirection: 'row', marginVertical: 10 },
  yellowButton: { flex: 1, padding: 10, borderRadius: 5, backgroundColor: '#fbc02d' },
  timer: { fontSize: 24, textAlign: 'center', marginVertical: 10 },
  rowSmall: { flexDirection: 'row', marginBottom: 10 },
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

  tabBar: { backgroundColor: '#6200ee', height: 60 },
  btnText: { color: 'white', fontWeight: 'bold', textAlign: 'center' },
  tabLabel: { fontSize: 16, color: 'white' },
});

export default GigTimer;
