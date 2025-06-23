// Gig Timer - React Native (Expo) App with Final UI Tweaks

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
  StyleSheet
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { TabView, TabBar } from 'react-native-tab-view';

const GigTimer = () => {
  const initialLayout = { width: Dimensions.get('window').width };
  const [heats, setHeats] = useState([{ key: 'heat1', title: 'Heat 1' }]);
  const [index, setIndex] = useState(0);
  const [routes, setRoutes] = useState(heats);
  const [heatData, setHeatData] = useState({
    heat1: { raceName: '', boats: [], newBoatName: '', newBoatClub: '', results: [], tappedBoats: [], startTime: null, timer: 0, lastTap: null },
  });
  const timerRefs = useRef({});

  // Sync raceName from Heat 1 to others
  useEffect(() => {
    const base = heatData.heat1.raceName;
    setHeatData(prev => {
      const copy = { ...prev };
      routes.forEach(r => {
        if (r.key !== 'heat1') copy[r.key] = { ...copy[r.key], raceName: base }; 
      });
      return copy;
    });
  }, [heatData.heat1.raceName]);

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
      [key]: { ...prev[key], results: [], tappedBoats: [], timer: 0, startTime: null, lastTap: null }
    }));
  };

  const handleNewRace = () => {
    const key = routes[index].key;
    clearInterval(timerRefs.current[key]);
    setHeatData(prev => ({
      ...prev,
      [key]: { raceName: '', boats: [], newBoatName: '', newBoatClub: '', results: [], tappedBoats: [], timer: 0, startTime: null, lastTap: null }
    }));
  };

  const handleTapBoat = i => {
    const key = routes[index].key;
    const h = heatData[key];
    if (!h.startTime || h.tappedBoats.includes(i)) return;
    const t = ((Date.now() - h.startTime) / 1000).toFixed(1);
    const res = [...h.results, { idx: i, name: h.boats[i].name, club: h.boats[i].club, time: t }].sort((a,b)=>a.time-b.time);
    setHeatData(prev => ({ ...prev, [key]: { ...h, results: res, tappedBoats: [...h.tappedBoats,i], lastTap: i } }));
  };

  const handleUndo = () => {
    const key = routes[index].key;
    const h = heatData[key]; if (h.lastTap===null) return;
    const res = h.results.filter(r=>r.idx!==h.lastTap);
    setHeatData(prev => ({ ...prev, [key]: { ...h, results: res, tappedBoats: h.tappedBoats.filter(i=>i!==h.lastTap), lastTap: null } }));
  };

  const handleAddBoat = () => {
    const key = routes[index].key;
    const h = heatData[key];
    if (!h.newBoatName.trim()) return;
    setHeatData(prev => ({ ...prev, [key]: { ...h, boats: [...h.boats,{name:h.newBoatName,club:h.newBoatClub}], newBoatName:'', newBoatClub:'' } }));
  };

  const handleAddHeat = () => {
    const n = heats.length+1; const key = `heat${n}`;
    const newH = { key, title:`Heat ${n}` };
    setHeats(h=>[...h,newH]); setRoutes(r=>[...r,newH]);
    setHeatData(d=>({...d,[key]:{ raceName:heatData.heat1.raceName, boats:[],newBoatName:'',newBoatClub:'',results:[],tappedBoats:[],timer:0,startTime:null,lastTap:null}}));
  };

  const formatText = res=>{
    const key=routes[index].key; const h=heatData[key];
    const head=`Race: ${h.raceName}\nHeat: ${routes[index].title}`;
    const body=res.map(e=>`${e.name} (${e.club||''}) - ${e.time}s`).join('\n');
    return head+'\n'+body;
  };
  const copyRes = k=>{Clipboard.setStringAsync(formatText(heatData[k].results));Alert.alert('Results copied');};
  const shareRes = async k=>{
    const uri=FileSystem.documentDirectory+`${k}.csv`;
    const hdr='Race,Heat,Name,Club,Time';
    const body=heatData[k].results.map(e=>`${heatData[k].raceName},${routes[index].title},${e.name},${e.club||''},${e.time}`).join('\n');
    await FileSystem.writeAsStringAsync(uri,hdr+'\n'+body);
    await Sharing.shareAsync(uri);
  };

  const renderScene = ({route})=>{
    const d=heatData[route.key];
    return(
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined} keyboardVerticalOffset={Platform.OS==='ios'?80:StatusBar.currentHeight||0}>
      <SafeAreaView style={[styles.safeArea,{paddingTop:Platform.OS==='android'?StatusBar.currentHeight:0}]}>        
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps='handled'>
        <TextInput style={styles.input} placeholder='Race Name' value={d.raceName} onChangeText={t=>setHeatData(p=>({...p,[route.key]:{...d,raceName:t}}))}/>
        <Text style={styles.sub}>Add Boat</Text>
        <TextInput style={styles.input} placeholder='Boat Name' value={d.newBoatName} onChangeText={t=>setHeatData(p=>({...p,[route.key]:{...d,newBoatName:t}}))}/>
        <View style={styles.rowBoat}>
          <TextInput style={[styles.input,{flex:1,marginRight:5}]} placeholder='Club Name (optional)' value={d.newBoatClub} onChangeText={t=>setHeatData(p=>({...p,[route.key]:{...d,newBoatClub:t}}))}/>
          <TouchableOpacity style={[styles.button,{flex:1}]} onPress={handleAddBoat}><Text style={styles.btnText}>Add Boat</Text></TouchableOpacity>
        </View>
        <Text style={styles.timer}>{d.timer.toFixed(1)}s</Text>
        <View style={styles.rowBig}>
          <TouchableOpacity style={[styles.halfButtonBig,{marginRight:5}]} onPress={handleStart}><Text style={styles.btnText}>Start</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.halfButtonBig,{backgroundColor:'red',marginLeft:5}]} onPress={handleStop}><Text style={styles.btnText}>Stop</Text></TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.button,{backgroundColor:'#fb8c00'}]} onPress={handleUndo}><Text style={styles.btnText}>Undo Last Tap</Text></TouchableOpacity>
        <View style={styles.rowSmall}>
          <TouchableOpacity style={[styles.yellowButton,{marginRight:5}]} onPress={handleReset}><Text style={styles.btnText}>Reset</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.yellowButton,{marginLeft:5}]} onPress={handleNewRace}><Text style={styles.btnText}>New Race</Text></TouchableOpacity>
        </View>
        <Text style={styles.noteText}>Tap boat buttons below as boats cross finish line</Text>
        <View style={styles.boatContainer}>{d.boats.map((b,i)=>(<TouchableOpacity key={i} style={[styles.boatButton,d.tappedBoats.includes(i)?styles.boatTapped:null]} onPress={()=>handleTapBoat(i)}><Text style={styles.boatText}>{b.name}{b.club?` (${b.club})`:''}</Text></TouchableOpacity>))}</View>
        <Text style={styles.sub}>Results</Text>
        <View style={styles.exportRow}><TouchableOpacity style={styles.halfButtonExport} onPress={()=>copyRes(route.key)}><Text style={styles.btnText}>Copy Results</Text></TouchableOpacity><TouchableOpacity style={styles.halfButtonExport} onPress={()=>shareRes(route.key)}><Text style={styles.btnText}>Share CSV</Text></TouchableOpacity></View>
        {d.results.map((r,i)=><Text key={i}>{i+1}. {r.name} ({r.club}) - {r.time}s</Text>)}
      </ScrollView>
      </SafeAreaView>
      </KeyboardAvoidingView>
    );
  };

  return(
    <SafeAreaView style={{flex:1}}>
      <TouchableOpacity style={[styles.addHeat,{marginTop:Platform.OS==='android'?StatusBar.currentHeight+5:5}]} onPress={handleAddHeat}><Text style={styles.addHeatText}>+ Add Heat</Text></TouchableOpacity>
      <TabView navigationState={{index,routes}} renderScene={renderScene} onIndexChange={setIndex} initialLayout={initialLayout} renderTabBar={props=><TabBar {...props} indicatorStyle={{backgroundColor:'white'}} labelStyle={styles.tabLabel} style={styles.tabBar}/>}/>
    </SafeAreaView>
  );
};

const styles=StyleSheet.create({
  safeArea:{flex:1,borderBottomWidth:8,borderColor:'#ccc'},
  container:{padding:16},
  title:{position:'absolute',top:Platform.OS==='android'?StatusBar.currentHeight:0,alignSelf:'center',color:'white',fontSize:18,fontWeight:'bold'},
  input:{borderWidth:1,borderColor:'#ccc',padding:10,marginBottom:10,borderRadius:5},
  sub:{fontSize:18,fontWeight:'bold',marginVertical:10},
  rowBoat:{flexDirection:'row',marginBottom:10},
  button:{backgroundColor:'#4CAF50',padding:10,borderRadius:5,alignItems:'center',marginVertical:5},
  addHeat:{backgroundColor:'#6200ee',padding:10,alignItems:'center'},
  addHeatText:{color:'white',fontWeight:'bold'},
  halfButtonBig:{flex:1,padding:15,borderRadius:5,backgroundColor:'#4CAF50'},
  rowBig:{flexDirection:'row',marginVertical:10},
  yellowButton:{flex:1,padding:10,borderRadius:5,backgroundColor:'#fbc02d'},
  timer:{fontSize:24,textAlign:'center',marginVertical:10},
  rowSmall:{flexDirection:'row',marginBottom:10},
  noteText:{fontSize:12,color:'#333',marginBottom:10,textAlign:'center'},
  boatContainer:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'},
  boatButton:{backgroundColor:'#2196F3',padding:10,borderRadius:5,width:'48%',marginVertical:4,alignItems:'center'},
  boatTapped:{backgroundColor:'#444'},
  boatText:{color:'white',fontSize:16},
  exportRow:{flexDirection:'row',marginVertical:10},
  halfButtonExport:{flex:1,padding:10,borderRadius:5,backgroundColor:'#4CAF50',marginHorizontal:5},
  tabBar:{backgroundColor:'#6200ee',height:60},
  btnText: { color: 'white', fontWeight: 'bold', textAlign: 'center' },
  tabLabel: { fontSize:16, color:'white' },
});

export default GigTimer;
