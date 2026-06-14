/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, SkipForward, RefreshCw, Sliders, ChevronRight, HelpCircle, AlertTriangle, 
  CheckCircle2, XCircle, Brain, Cpu, Eye, Activity, Info, Bot, Sparkles, Dog, Cat, Map, Flame, Layers, Plus, RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// 방향 정의: 0 - 상, 1 - 우, 2 - 하, 3 - 좌
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const DIR_NAMES = ["북쪽 (▲)", "동쪽 (▶)", "남쪽 (▼)", "서쪽 (◀)"];

// 맵 프리셋 정의
interface MapPreset {
  name: string;
  description: string;
  obstacles: [number, number][]; // [y, x] 쌍
}

const MAP_PRESETS: Record<string, MapPreset> = {
  default: {
    name: "기본 스마트홈",
    description: "가구와 벽체 배치 등 일상적인 가정 주택 거실 구획",
    obstacles: [
      [2, 2], [2, 3], [2, 4],
      [5, 1], [5, 2],
      [4, 5], [4, 6]
    ]
  },
  maze: {
    name: "지그재그 미로",
    description: "에이전트의 경로 설계 능력을 극대화하여 관찰하는 유도 장벽",
    obstacles: [
      [1, 1], [2, 1], [3, 1],
      [4, 3], [5, 3], [6, 3],
      [1, 5], [2, 5], [3, 5],
      [4, 6]
    ]
  },
  empty: {
    name: "자유형 배움터",
    description: "장애물이 없는 완전 공실. 마우스로 채워가며 테스트해 보세요!",
    obstacles: []
  }
};

export default function App() {
  // --- 시뮬레이션 기본 상태 선언 ---
  const [activePreset, setActivePreset] = useState<string>("default");
  
  // 8x8 그리드 생성 (0: 빈 칸, 1: 장애물)
  const [grid, setGrid] = useState<number[][]>(() => {
    const freshGrid = Array(8).fill(null).map(() => Array(8).fill(0));
    MAP_PRESETS.default.obstacles.forEach(([y, x]) => {
      freshGrid[y][x] = 1;
    });
    return freshGrid;
  });

  // 청소 흔적 맵 (학습 모듈에서 실제 흔적 체크)
  const [cleaned, setCleaned] = useState<boolean[][]>(() => {
    return Array(8).fill(null).map(() => Array(8).fill(false));
  });

  // 에이전트 상태
  const [robotX, setRobotX] = useState<number>(0);
  const [robotY, setRobotY] = useState<number>(0);
  const [robotDir, setRobotDir] = useState<number>(1); // 기본 동쪽(우측) 바라봄

  // 반려동물(강아지/고양이) 상태 - 초기 위치 지정
  const [petX, setPetX] = useState<number>(6);
  const [petY, setPetY] = useState<number>(6);
  const [petType, setPetType] = useState<'dog' | 'cat'>('dog');

  // 시뮬레이터 제어
  const [isOperating, setIsOperating] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(700); // 1단계당 속도(ms)
  const [stepCount, setStepCount] = useState<number>(0);
  const [collisionCount, setCollisionCount] = useState<number>(0);
  
  // 피드백 루프 원리 제어 스위치
  const [perceptionOn, setPerceptionOn] = useState<boolean>(true);
  const [judgmentOn, setJudgmentOn] = useState<boolean>(true);
  const [actionOn, setActionOn] = useState<boolean>(true);
  const [learningOn, setLearningOn] = useState<boolean>(true);

  // 알고리즘 탐 감지 학습 모드: 'early' | 'modern'
  const [algorithmMode, setAlgorithmMode] = useState<'early' | 'modern'>('modern');

  // 텔레메트리/피드백 루프 상황 기록부
  const [telemetry, setTelemetry] = useState({
    perception: "대기 중...",
    judgment: "대기 중...",
    action: "대기 중...",
    learning: "대기 중..."
  });

  // 에이전트의 내부 정신적 청소 지도 (Mental Map) - 학습이 켜져 있을 때만 완벽히 갱신됨
  const [mentalMap, setMentalMap] = useState<('unexplored' | 'clean' | 'obstacle')[][]>(() => {
    return Array(8).fill(null).map(() => Array(8).fill('unexplored'));
  });

  // 누적 데이터 편향 레이어용 통계 데이터
  const [trashCleanedCount, setTrashCleanedCount] = useState<number>(0);
  const [petCollidedAsTrashCount, setPetCollidedAsTrashCount] = useState<number>(0);
  const [totalStepsComputed, setTotalStepsComputed] = useState<number>(0);

  // 실시간 메시지 로그 버퍼
  const [logs, setLogs] = useState<string[]>([
    "🤖 지능 에이전트 가상 시뮬레이터가 성공적으로 초기화되었습니다.",
    "💡 [학습 꿀팁] '인식, 판단, 행동, 학습' 네 개의 토글을 끄고 결함 분석을 진행해 보세요!"
  ]);

  // 그리드에 일시적으로 발생하는 애니메이션 이벤트 상태들
  const [showCollisionFlash, setShowCollisionFlash] = useState<boolean>(false);
  const [showLaserBeam, setShowLaserBeam] = useState<boolean>(true);
  const [petScaredEffect, setPetScaredEffect] = useState<boolean>(false);

  // 타이머 실행용 ref
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // -------------------------------------------------------------
  // 1. 센서 빔 계산 (Perception 범위 탐색용)
  // -------------------------------------------------------------
  // 벽이나 장애물이 나올 때까지 전방 최대 3칸의 라이다/초음파 빔을 시각화
  const getSensorBeamCells = () => {
    if (!perceptionOn) return [];
    
    const beam: [number, number][] = [];
    let currentX = robotX;
    let currentY = robotY;
    const dx = DX[robotDir];
    const dy = DY[robotDir];

    for (let i = 1; i <= 3; i++) {
      const nextX = currentX + dx * i;
      const nextY = currentY + dy * i;

      // 물리적 그리드 밖인지 유효성 검사
      if (nextX < 0 || nextX >= 8 || nextY < 0 || nextY >= 8) {
        break;
      }
      
      beam.push([nextY, nextX]);
      
      // 만약 벽/장애물이 있으면 거기서 빔 서칭 정지! (실제 단거리 반사파 모델링)
      if (grid[nextY][nextX] === 1) {
        break;
      }
    }
    return beam;
  };

  // -------------------------------------------------------------
  // 2. 가상 시스템 로그 쓰기
  // -------------------------------------------------------------
  const addLog = (msg: string) => {
    setLogs(prev => [msg, ...prev.slice(0, 19)]);
  };

  // -------------------------------------------------------------
  // 3. 맵 프리셋 로더 및 완전 리셋
  // -------------------------------------------------------------
  const loadPresetMap = (presetKey: string) => {
    const preset = MAP_PRESETS[presetKey];
    setActivePreset(presetKey);
    
    const newGrid = Array(8).fill(null).map(() => Array(8).fill(0));
    preset.obstacles.forEach(([y, x]) => {
      newGrid[y][x] = 1;
    });
    setGrid(newGrid);

    // 에이전트와 반려동물 기본 위치 보정 복구
    setRobotX(0);
    setRobotY(0);
    setRobotDir(1); // 동쪽
    setPetX(6);
    setPetY(6);

    // 청소 및 통계 초기화
    const freshCleaned = Array(8).fill(null).map(() => Array(8).fill(false));
    freshCleaned[0][0] = true; // 최초 시작구획 청소
    setCleaned(freshCleaned);

    const freshMental = Array(8).fill(null).map(() => Array(8).fill('unexplored'));
    freshMental[0][0] = 'clean';
    setMentalMap(freshMental);

    setStepCount(0);
    setCollisionCount(0);
    setIsOperating(false);
    
    addLog(`🔄 [맵 교체] '${preset.name}' 맵이 새로 세팅되었습니다.`);
  };

  // -------------------------------------------------------------
  // 4. 그리드 셀 클릭 토글 핸들러 (사용자가 개별 장애물 세팅 가능)
  // -------------------------------------------------------------
  const handleCellClick = (y: number, x: number) => {
    // 플레이어나 반려동물이 위치한 자리는 벽으로 지정 불가
    if ((x === robotX && y === robotY) || (x === petX && y === petY)) {
      return;
    }
    
    const newGrid = grid.map(row => [...row]);
    newGrid[y][x] = newGrid[y][x] === 1 ? 0 : 1;
    setGrid(newGrid);

    // 지능 에이전트의 내부 지도에서도 실시간 탐색 여부에 연계
    if (learningOn) {
      setMentalMap(prev => {
        const nextMental = prev.map(row => [...row]);
        if (newGrid[y][x] === 1) {
          nextMental[y][x] = 'obstacle';
        } else {
          nextMental[y][x] = 'unexplored';
        }
        return nextMental;
      });
    }

    addLog(`✏️ 그리드 연동: (${x}, ${y}) 구역의 장애물이 ${newGrid[y][x] === 1 ? '지정' : '제거'}되었습니다.`);
  };

  // -------------------------------------------------------------
  // 5. 반려동물과 랜덤 자율 이동 제어
  // -------------------------------------------------------------
  const movePetMechanics = (currentPetX: number, currentPetY: number, robotXLoc: number, robotYLoc: number) => {
    // 4방향 이동 고려
    const validMoves: [number, number][] = [];
    
    for (let d = 0; d < 4; d++) {
      const targetX = currentPetX + DX[d];
      const targetY = currentPetY + DY[d];
      
      // 범위 조건
      if (targetX >= 0 && targetX < 8 && targetY >= 0 && targetY < 8) {
        // 벽이 아니어야 함, 로봇 위치가 아니어야 함
        if (grid[targetY][targetX] !== 1 && !(targetX === robotXLoc && targetY === robotYLoc)) {
          validMoves.push([targetY, targetX]);
        }
      }
    }

    // 확률적으로 그 자리에 머무르거나 한 단계 인접 칸으로 도보 이동
    if (validMoves.length > 0 && Math.random() > 0.3) {
      const index = Math.floor(Math.random() * validMoves.length);
      const [nextY, nextX] = validMoves[index];
      setPetX(nextX);
      setPetY(nextY);
    }
  };

  // -------------------------------------------------------------
  // 6. 단일 시뮬레이션 한 스텝 메인 엔진 루프
  // -------------------------------------------------------------
  const computeSimulationStep = () => {
    setStepCount(prev => prev + 1);
    setTotalStepsComputed(prev => prev + 1);

    // 실시간 피드백 연산 로컬 변수
    let currentLogPerception = "결함 상태: 감지 마비";
    let currentLogJudgment = "판단 판단불능";
    let currentLogAction = "행동 모터 미구동";
    let currentLogLearning = "학습 기억 차단됨";

    let targetDecision: 'FORWARD' | 'TURN_RIGHT' | 'SPIN_ERRATIC' | 'STOP' = 'STOP';
    let detectedDistanceAhead = 999;
    let isPetDetectedAhead = false;
    let petDetectionDistance = -1;

    const dx = DX[robotDir];
    const dy = DY[robotDir];

    // ==========================================
    // STAGE 1: 인식(Perception) 원리
    // ==========================================
    if (perceptionOn) {
      // 라이더/초음파 센서 스윕 수행 (시선 상 전방 장애물이나 외부 개체 감지)
      let obstacleFound = false;
      
      for (let dist = 1; dist <= 3; dist++) {
        const checkX = robotX + dx * dist;
        const checkY = robotY + dy * dist;

        // 경계선 또는 지정 장애물 충돌 검지
        if (checkX < 0 || checkX >= 8 || checkY < 0 || checkY >= 8 || grid[checkY][checkX] === 1) {
          detectedDistanceAhead = dist;
          obstacleFound = true;
          break;
        }

        // 반려동물이 전방 레이저 투사 궤도에 걸렸는지 검출
        if (checkX === petX && checkY === petY) {
          isPetDetectedAhead = true;
          petDetectionDistance = dist;
          detectedDistanceAhead = dist; // 최우선 추적
          break;
        }
      }

      if (isPetDetectedAhead) {
        if (algorithmMode === 'early') {
          // [초창기 인식 알고리즘 결함] 반려동물을 데이터 누락으로 인해 거대 털 뭉치로 파악
          currentLogPerception = `⚠️ [비정상 객체인식] 전방 ${petDetectionDistance}칸 지점에서 '거대 털 뭉치 쓰레기' 고밀도 감지!`;
          addLog("🕵️ [인식 에러] 센서가 가동 중인 반려동물을 '대형 먼지 쓰레기'로 착각 식별했습니다.");
        } else {
          // [현대 인식 모델] 이미지 처리 기반 딥러닝 다중 추적 완벽 식별
          currentLogPerception = `✅ [생물체 실시간 감지] 전방 ${petDetectionDistance}칸에 '반려동물(생명체)' 출현 감지!`;
          addLog("🐕 [현대 인식] 멀티 레이블 딥러닝 필터가 반려동물을 올바르게 보호 대상으로 검지했습니다.");
        }
      } else if (obstacleFound) {
        currentLogPerception = `📡 [거리 측위 확보] 전방 ${detectedDistanceAhead}칸 위치에 물리 장벽/장애물 감지`;
      } else {
        currentLogPerception = "🟢 [경로 안정] 안전 거리 내 진로 확보됨 (장애물 없음)";
      }
    } else {
      // 인식 차단 시, 에이전트는 전방에 아무것도 없다고 신뢰해버림 (충돌 원인 제공)
      detectedDistanceAhead = 999;
      currentLogPerception = "🚫 [센서 오프라인] 전방 측정 전압 0V - 감각 상실 상태";
      addLog("❌ [인식 결함] 초음파 레이더 미가동. 장애물이 전방에 있어도 볼 수 없습니다.");
    }

    // ==========================================
    // STAGE 2: 판단(Judgment) 원리
    // ==========================================
    if (judgmentOn) {
      if (perceptionOn) {
        // 본래 센서 상 전방 1칸 이내가 차단 상황일 시 회피 결정 처리
        if (isPetDetectedAhead && algorithmMode === 'early') {
          // [초창기 모드 편향적 행동 지시] '털 뭉치'이므로 회피를 무시하고 오히려 흡입하기 위해 직진 돌진한다!
          targetDecision = 'FORWARD';
          currentLogJudgment = "🚨 [편향적 판단] 먼지량이 높은 초대형 쓰레기 획득을 위해 격렬한 고속 직진 흡입 유도";
          addLog("⚠️ [판단 오류] 데이터 편향: '털 뭉치'를 격리하기 위해 도망가는 동물을 추적하기로 억지 판단!");
        } else if (isPetDetectedAhead && algorithmMode === 'modern') {
          // [현대 모드 의인화 우수 엔진] 반려동물 접촉 방지를 위해 우회 정방향 선회
          targetDecision = 'TURN_RIGHT';
          currentLogJudgment = "🐾 [생물 회피 우회] 안전 거리 유지 및 접촉 방지를 위해 90도 긴급 회피 조향 결정";
          addLog("🛡️ [현대 판단] 안전 예방 알고리즘 발동: 반려동물 생명 보호 구역 외곽선 선회 조향 작동.");
        } else if (detectedDistanceAhead === 1) {
          // 일반 장애물에 밀착 시 우회전 판단
          targetDecision = 'TURN_RIGHT';
          currentLogJudgment = "🔄 [장애물 검지 우회] 벽 접촉 회피를 위한 우측 90도 회전(전치 방향 변속)";
        } else {
          // 안전 경로 확보 시 직진
          targetDecision = 'FORWARD';
          currentLogJudgment = "🧭 [진로 추진 결정] 장애물 한계선 구획 바깥으로 정속 직속 주행 결정";
        }
      } else {
        // 인식이 OFF 된 경우, 판단 모듈은 가짜 데이터(거리 999)에 속아 무조건 '직진 가능'으로 해석해 버림
        targetDecision = 'FORWARD';
        currentLogJudgment = "💀 [오염 데이터 판단] 입력 센서값의 누락으로 '무결 주행 가능'으로 기만적 오인 판정";
      }
    } else {
      // 판단이 꺼져 있으면, 알고리즘 연동이 되지 않아 우회할 줄을 모름. 무기력하게 제자리에서 회전 주행 틱만 발생
      targetDecision = 'SPIN_ERRATIC';
      currentLogJudgment = "⚠️ [판단 결함] 논리 분기 콤파일 중단 - 제자리 회전 미결정 방황";
      addLog("❌ [판단 결함] 에이전트 브레인이 정지하여 위험을 인지하고도 어떤 대안도 마련하지 못합니다.");
    }

    // ==========================================
    // STAGE 3: 행동(Action) 원리
    // ==========================================
    let nextX = robotX;
    let nextY = robotY;
    let finalDirection = robotDir;

    if (actionOn) {
      if (targetDecision === 'FORWARD') {
        const checkNextX = robotX + dx;
        const checkNextY = robotY + dy;

        // 물리적 실시간 충돌 검증 레벨 (센서 끄고 가다가 벽을 박는 물리엔진)
        if (checkNextX < 0 || checkNextX >= 8 || checkNextY < 0 || checkNextY >= 8 || grid[checkNextY][checkNextX] === 1) {
          // 💥 실제 벽 충돌!
          setCollisionCount(prev => prev + 1);
          setShowCollisionFlash(true);
          setTimeout(() => setShowCollisionFlash(false), 300);
          
          currentLogAction = `💥 [치명적 충돌] (${checkNextX}, ${checkNextY}) 지형 벽면 타격 발생! 에이전트 정지`;
          addLog(`💥 [충돌 경고] 크래시 발생! 인식 결함 상태에서 무리하게 돌진하여 벽에 충돌했습니다.`);
        } else if (checkNextX === petX && checkNextY === petY) {
          // 반려동물 위치에 난입했을 때 처리
          if (algorithmMode === 'early') {
            setPetCollidedAsTrashCount(prev => prev + 1);
            setPetScaredEffect(true);
            setTimeout(() => setPetScaredEffect(false), 500);

            // 반려동물이 깜짝 놀라 맵 내 다른 안전 빈칸으로 도주 리스폰
            let petEscaped = false;
            while (!petEscaped) {
              const rx = Math.floor(Math.random() * 8);
              const ry = Math.floor(Math.random() * 8);
              if (grid[ry][rx] !== 1 && !(rx === robotX && ry === robotY)) {
                setPetX(rx);
                setPetY(ry);
                petEscaped = true;
              }
            }

            nextX = checkNextX;
            nextY = checkNextY;
            currentLogAction = "🐈💨 [동물 소출] '거대 털 뭉치' 흡입 중 가동 객체 자이로 이탈 (혼동 탈출)";
            addLog("⚠️ [편향적 포착] 에이전트가 고양이/강아지를 덮쳐서 반려동물이 화들짝 놀라 멀리 도망쳤습니다!");
          } else {
            // 현대 모드는 판단에서 거르나, 인식 OFF + 판단 ON / 오프 계통 조합의 비정상 접근 시 백업
            setCollisionCount(prev => prev + 1);
            currentLogAction = "🛑 [생명 긴급 차단] 반려동물 기동선 침입으로 구동 모터 충격 수동 제정 지제";
            addLog("🚔 [긴급 가동 제한] 반려동물 충돌 임계선 도달로 모터가 긴급 제동했습니다.");
          }
        } else {
          // 정상 이동 수행
          nextX = checkNextX;
          nextY = checkNextY;
          
          if (algorithmMode === 'early' && isPetDetectedAhead) {
            currentLogAction = `🚀 [돌진 흡입] (${nextX}, ${nextY}) 좌표 먼지 집속 급속 진격`;
          } else {
            currentLogAction = `⚙️ [스태퍼 구동] (${nextX}, ${nextY}) 좌표로 스윙 기어 슬라이딩 전진`;
          }
        }
      } else if (targetDecision === 'TURN_RIGHT') {
        // 90도 회향 변위 구동
        finalDirection = (robotDir + 1) % 4;
        currentLogAction = `🔄 [바퀴 조향 변환] 좌측 모터 가압, 우측 보정조타 - ${DIR_NAMES[finalDirection]} 전향`;
      } else if (targetDecision === 'SPIN_ERRATIC') {
        // 제자리 방황 스핀 틱
        finalDirection = (robotDir + 1) % 4;
        currentLogAction = `🌀 [미정의 회전] 스텝 동력 불평형 - 제자리 지속 방향 재변환 반복 (${DIR_NAMES[finalDirection]})`;
      }
      
      // 모터 동작 좌표 반영
      setRobotX(nextX);
      setRobotY(nextY);
      setRobotDir(finalDirection);
    } else {
      currentLogAction = "🛑 [구동 모터 전원 무배치] 하드웨어 가동 정지 (동작 신호 무시)";
      addLog("❌ [행동 결함] 바퀴 모터에 작동 신호가 닿지 않아 자리에 멈춰 서 있습니다.");
    }

    // ==========================================
    // STAGE 4: 학습(Learning) 원리
    // ==========================================
    if (learningOn) {
      // 1. 실제 청소 흔적 맵 실시간 마킹 처리
      setCleaned(prev => {
        const nextCleaned = prev.map(row => [...row]);
        if (!nextCleaned[nextY][nextX]) {
          nextCleaned[nextY][nextX] = true;
          setTrashCleanedCount(t => t + 1);
        }
        return nextCleaned;
      });

      // 2. 에이전트의 자체 기억 Mental Map 지속적 갱신 및 시각화용 데이터 갱신
      setMentalMap(prev => {
        const nextMental = prev.map(row => [...row]);
        
        // 현재 위치 청소 영역 표기 기록
        nextMental[nextY][nextX] = 'clean';
        
        // 시선 방향 내에서 식별했던 장애물 위치 지도에 지속적 반영 (기억 정립)
        if (perceptionOn) {
          const radarX = robotX + dx;
          const radarY = robotY + dy;
          if (radarX >= 0 && radarX < 8 && radarY >= 0 && radarY < 8) {
            if (grid[radarY][radarX] === 1) {
              nextMental[radarY][radarX] = 'obstacle';
            }
          }
        }
        return nextMental;
      });
      
      currentLogLearning = "🧠 [인하우스 맵핑] 라이브 기억 셀 슬롯 갱신 및 탐색구역 지도 융합";
    } else {
      // 학습 결함 시, 흔적 흔적 기록이 불가능하거나 지도가 오염
      currentLogLearning = "💾 [기억상실 소자] 비휘발성 플래시 수동 쓰기 거부 상태 (메모리 락)";
      addLog("❌ [학습 결함] 청소한 곳을 기억하는 '환경 학습 장치'가 꺼져 청소 구도를 낭비하게 됩니다.");
    }

    // 텔레메트리 데이터 한 번에 업로드
    setTelemetry({
      perception: currentLogPerception,
      judgment: currentLogJudgment,
      action: currentLogAction,
      learning: currentLogLearning
    });

    // 반려동물 상태도 시뮬 하프 비트 듀레이션 단위 이동
    if (stepCount % 2 === 0) {
      movePetMechanics(petX, petY, nextX, nextY);
    }
  };

  // -------------------------------------------------------------
  // 7. 러닝 타이머 훅 제어
  // -------------------------------------------------------------
  useEffect(() => {
    if (isOperating) {
      timerRef.current = setInterval(() => {
        computeSimulationStep();
      }, speed);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isOperating, speed, robotX, robotY, robotDir, petX, petY, grid, perceptionOn, judgmentOn, actionOn, learningOn, algorithmMode, stepCount]);

  // -------------------------------------------------------------
  // 8. 추가 수치 계산 (청소 완성율)
  // -------------------------------------------------------------
  const getObstaclesCount = () => {
    let count = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (grid[r][c] === 1) count++;
      }
    }
    return count;
  };

  const totalObstables = getObstaclesCount();
  const cleanableTilesCount = 64 - totalObstables;
  
  const getCountActualCleaned = () => {
    let result = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (cleaned[r][c] && grid[r][c] !== 1) result++;
      }
    }
    return result;
  };
  
  const actualCleanedCount = getCountActualCleaned();
  const cleanCoverageRatio = Math.round((actualCleanedCount / cleanableTilesCount) * 100);

  // -------------------------------------------------------------
  // 9. 초기화 트리거
  // -------------------------------------------------------------
  const resetOperationConsole = () => {
    loadPresetMap(activePreset);
    setTrashCleanedCount(0);
    setPetCollidedAsTrashCount(0);
    setTotalStepsComputed(0);
    setLogs([
      "🧹 가상 공간 환경 시스템과 시뮬레이터 카운터가 완전히 리셋되었습니다."
    ]);
  };

  // -------------------------------------------------------------
  // 10. 반려동물 정체 스위칭
  // -------------------------------------------------------------
  const togglePetType = () => {
    setPetType(prev => prev === 'dog' ? 'cat' : 'dog');
    addLog(`🐾 관찰 대상을 ${petType === 'dog' ? '고양이' : '강아지'}로 전환했습니다.`);
  };

  // 센서 빔 해당 리스트 캐싱
  const sensorBeamList = getSensorBeamCells();

  // 데이터 편향 예측 확률 바 계산
  const totalEarlyBiasDataEncountered = trashCleanedCount + petCollidedAsTrashCount * 5;
  const earlyBiasTrashRatio = totalEarlyBiasDataEncountered > 0 ? 100 : 0;
  
  // 현대 다중 검증 비율
  const modernTotalEncounter = trashCleanedCount + petCollidedAsTrashCount + 10;
  const modernTrashRatio = Math.round((trashCleanedCount / modernTotalEncounter) * 100) || 75;
  const modernPetRatio = Math.round(((petCollidedAsTrashCount + 10) / modernTotalEncounter) * 100) || 25;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col antialiased bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:20px_20px]">
      
      {/* --- 탑 네비게이션 / 빔 헤더 --- */}
      <header className="bg-indigo-600 text-white shrink-0 shadow-lg border-b border-indigo-700/50">
        <div className="max-w-7xl mx-auto py-4 px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-white text-indigo-700 rounded-lg font-black font-display text-sm tracking-widest shadow-md">AI</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-505/30 bg-indigo-700 text-indigo-200 rounded border border-indigo-500/20">
                  2022 개정 정보과제 연계
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-pink-505/30 bg-pink-500 text-white rounded border border-pink-500/20">
                  인공지능 교육연구실
                </span>
              </div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-white uppercase font-display leading-tight mt-1">
                INTELLIGENT AGENT SIMULATOR: VACUUM BOT
              </h1>
              <p className="text-indigo-105 text-xs text-indigo-200/90">
                인식-판단-행동-학습 피드백 루프 분석과 데이터 편향 체험 배움터
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 self-stretch md:self-auto justify-end">
            <a 
              href="#educational-help"
              onClick={() => addLog("📘 [교육 가이드] 화면 하단의 '학습 핵심 요약 교재'를 참고하여 동작 원리를 분석해보세요.")}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-700/50 hover:bg-indigo-700 text-indigo-150 border border-white/10 rounded-lg text-xs font-semibold cursor-pointer transition-all"
            >
              <Info className="w-3.5 h-3.5" />
              학습 교재 교안 보기
            </a>
          </div>
        </div>
      </header>

      {/* --- 메인 시메트릭 3컬럼 레이아웃 바디 --- */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* ============================================================== */}
        {/* COLUMN 1: LEFT SIDEBAR (Controls & Bias) - lg:col-span-3       */}
        {/* ============================================================== */}
        <section className="col-span-1 lg:col-span-12 xl:col-span-3 flex flex-col gap-6">

          {/* 1. 알고리즘 필터 선택 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(99,102,241,0.06)] transition-all flex flex-col gap-3">
            <div className="border-b border-rose-100 pb-2.5">
              <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded border border-rose-100 uppercase tracking-wider">
                CORE PILOT
              </span>
              <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5 font-display mt-1">
                <Sparkles className="w-4 h-4 text-amber-500" />
                인식 알고리즘 필터
              </h3>
            </div>

            {/* 토글 스위치형 필터 셀렉터 */}
            <div className="flex rounded-lg bg-slate-100 p-1 border border-slate-200 shadow-inner">
              <button
                onClick={() => {
                  setAlgorithmMode('early');
                  addLog("🎯 [알고리즘 교체] '초창기 인식 에이전트(Early)' 전환 완료. 데이터 편향성이 가용됩니다.");
                }}
                className={`flex-1 px-2.5 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  algorithmMode === 'early' 
                    ? 'bg-rose-500 text-white shadow-md' 
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                초창기 모드
              </button>
              <button
                onClick={() => {
                  setAlgorithmMode('modern');
                  addLog("🎯 [알고리즘 교체] '현대적 인식 에이전트(Modern)' 스마트 세팅이 복귀되었습니다.");
                }}
                className={`flex-1 px-2.5 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  algorithmMode === 'modern' 
                    ? 'bg-emerald-600 text-white shadow-md' 
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                현대 모드
              </button>
            </div>

            {/* 상태 기술서 피드백 */}
            <div className="text-xs space-y-2 mt-1">
              {algorithmMode === 'early' ? (
                <div className="p-3 rounded-xl border bg-rose-50/50 border-rose-150 ring-1 ring-rose-300/10">
                  <h4 className="font-extrabold text-rose-700 flex items-center gap-1 mb-1">
                    🔴 초창기 알고리즘 (Early)
                  </h4>
                  <p className="leading-relaxed text-slate-605 text-[11px]">
                    '반려동물'이 결손되어, 동물을 감지하면 <b>단순 거대 털 뭉치 쓰레기</b>로 취급합니다. 회피 없이 <b>청소(충돌)</b>하려고 진입을 고집합니다.
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-xl border bg-emerald-50/50 border-emerald-150 ring-1 ring-emerald-300/10">
                  <h4 className="font-extrabold text-emerald-800 flex items-center gap-1 mb-1">
                    🟢 현대 알고리즘 (Modern)
                  </h4>
                  <p className="leading-relaxed text-slate-605 text-[11px]">
                    안전지향 분류 모델을 통해 반려동물을 고유 생명체로 식별합니다. 스스로 경로각을 새로 짜 우회 탐색을 실현합니다.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 2. 에이전트 결함 유발 제어 스위치 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(99,102,241,0.06)] transition-all flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-indigo-50 pb-2.5">
              <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5 font-display">
                <Sliders className="w-4 h-4 text-indigo-600" />
                지능 에이전트 피드백 루프
              </h3>
              <button 
                onClick={() => {
                  setPerceptionOn(true);
                  setJudgmentOn(true);
                  setActionOn(true);
                  setLearningOn(true);
                  addLog("🛠️ 모든 AI 피드백 기능이 기본 구동(ON)으로 초기화되었습니다.");
                }}
                className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-0.5 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                정상화 (ON)
              </button>
            </div>
            <p className="text-slate-500 text-[11px] mb-1 leading-normal">
              체크를 해제하면 해당 단계에 <b>기술적 결함</b>이 강제로 주입됩니다.
            </p>

            <div className="flex flex-col gap-2.5 mt-0.5">
              
              {/* 인식 ON/OFF */}
              <label className={`block border p-2.5 rounded-xl cursor-pointer select-none transition-all ${
                perceptionOn 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:border-emerald-200' 
                  : 'bg-rose-50 border-rose-200 text-rose-700 ring-1 ring-rose-300/40'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`p-1 rounded-lg ${perceptionOn ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white animate-pulse'}`}>
                      <Eye className="w-4 h-4" />
                    </span>
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs">인식 (Perception)</h4>
                      <p className="text-[10px] text-slate-500 leading-none">장애물 탐지 센서</p>
                    </div>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={perceptionOn}
                    onChange={(e) => {
                      setPerceptionOn(e.target.checked);
                      addLog(`⚙️ [기능 제어] '인식(Perception)' 모듈이 ${e.target.checked ? '활성화' : '가상 종료(결함 유발)'} 되었습니다.`);
                    }}
                    className="w-4 h-4 accent-indigo-600 cursor-pointer"
                  />
                </div>
              </label>

              {/* 판단 ON/OFF */}
              <label className={`block border p-2.5 rounded-xl cursor-pointer select-none transition-all ${
                judgmentOn 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:border-emerald-200' 
                  : 'bg-rose-50 border-rose-200 text-rose-700 ring-1 ring-rose-300/40'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`p-1 rounded-lg ${judgmentOn ? 'bg-purple-500 text-white' : 'bg-red-500 text-white animate-pulse'}`}>
                      <Brain className="w-4 h-4" />
                    </span>
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs">판단 (Judgment)</h4>
                      <p className="text-[10px] text-slate-500 leading-none">우회 결정 규칙</p>
                    </div>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={judgmentOn}
                    onChange={(e) => {
                      setJudgmentOn(e.target.checked);
                      addLog(`⚙️ [기능 제어] '판단(Judgment)' 의사결정 모듈이 ${e.target.checked ? '활성화' : '수기 마비(결함 유발)'} 되었습니다.`);
                    }}
                    className="w-4 h-4 accent-indigo-600 cursor-pointer"
                  />
                </div>
              </label>

              {/* 행동 ON/OFF */}
              <label className={`block border p-2.5 rounded-xl cursor-pointer select-none transition-all ${
                actionOn 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:border-emerald-200' 
                  : 'bg-rose-50 border-rose-200 text-rose-700 ring-1 ring-rose-300/40'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`p-1 rounded-lg ${actionOn ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white animate-pulse'}`}>
                      <Cpu className="w-4 h-4" />
                    </span>
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs">행동 (Action)</h4>
                      <p className="text-[10px] text-slate-500 leading-none">모터 물리 구동</p>
                    </div>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={actionOn}
                    onChange={(e) => {
                      setActionOn(e.target.checked);
                      addLog(`⚙️ [기능 제어] '행동(Action)' 엔진 계통 모듈이 ${e.target.checked ? '활성화' : '전력 격리(결함 유발)'} 되었습니다.`);
                    }}
                    className="w-4 h-4 accent-indigo-600 cursor-pointer"
                  />
                </div>
              </label>

              {/* 학습 ON/OFF */}
              <label className={`block border p-2.5 rounded-xl cursor-pointer select-none transition-all ${
                learningOn 
                  ? 'bg-emerald-55 text-emerald-700 border-emerald-100 hover:border-emerald-200' 
                  : 'bg-rose-50 border-rose-200 text-rose-700 ring-1 ring-rose-300/40'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`p-1 rounded-lg ${learningOn ? 'bg-indigo-500 text-white' : 'bg-red-500 text-white animate-pulse'}`}>
                      <Map className="w-4 h-4" />
                    </span>
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs">학습 (Learning)</h4>
                      <p className="text-[10px] text-slate-505 leading-none">청소 흔적 보존</p>
                    </div>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={learningOn}
                    onChange={(e) => {
                      setLearningOn(e.target.checked);
                      addLog(`⚙️ [기능 제어] '학습(Learning)' 탐색 저장고가 ${e.target.checked ? '활성화' : '영구 저장잠금(결함 유발)'} 되었습니다.`);
                    }}
                    className="w-4 h-4 accent-indigo-600 cursor-pointer"
                  />
                </div>
              </label>

            </div>
          </div>

          {/* 3. 학습 데이터 편향성 과학 연구실 */}
          <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.03)] flex flex-col gap-3">
            <div>
              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-200 uppercase tracking-widest">
                AI BIAS DATA LAB
              </span>
              <h3 className="font-extrabold text-amber-900 text-sm flex items-center gap-1.5 font-display mt-1">
                <Layers className="w-4 h-4 text-amber-700" />
                학습 데이터 편향 과학소
              </h3>
            </div>

            <div className="text-xs text-amber-950 flex flex-col gap-2 mt-0.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                <span>{algorithmMode === 'early' ? '🚨 불균형 데이터셋 (편향적)' : '✅ 실제 데이터 밸런스 (공정함)'}</span>
                <span className="font-mono">T: {totalStepsComputed}Ticks</span>
              </div>

              {algorithmMode === 'early' ? (
                <div className="flex flex-col gap-3">
                  {/* 쓰레기 클래스 */}
                  <div className="space-y-1">
                    <div className="flex justify-between font-mono text-[10px] text-amber-800">
                      <span>쓰레기 / 먼지 (Trash Class)</span>
                      <span className="font-black text-rose-600">{earlyBiasTrashRatio}%</span>
                    </div>
                    <div className="w-full bg-amber-200/50 h-2.5 rounded-full overflow-hidden border border-amber-200">
                      <div className="bg-rose-500 h-full rounded-full" style={{ width: `${earlyBiasTrashRatio}%` }}></div>
                    </div>
                  </div>

                  {/* 펫 생명체 클래스 */}
                  <div className="space-y-1">
                    <div className="flex justify-between font-mono text-[10px] text-amber-800">
                      <span>반려동물 (Pet / Lifeform Class)</span>
                      <span className="font-bold text-amber-600/60">0% (식별 불가능)</span>
                    </div>
                    <div className="w-full bg-amber-200/50 h-2.5 rounded-full overflow-hidden border border-amber-200">
                      <div className="bg-amber-300 h-0" style={{ width: '0%' }}></div>
                    </div>
                  </div>

                  <div className="p-2.5 bg-rose-50 border-l-2 border-rose-400 rounded-r text-[10.5px] leading-relaxed text-rose-900 font-medium">
                    <b>데이터 오작동 주의:</b> 대중 데이터에서 생명 지도가 결손되어 강아지/고양이를 단순 쓰레기 더미로 착각해 파괴 추돌(추격)하게 됩니다!
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* 쓰레기 클래스 */}
                  <div className="space-y-1">
                    <div className="flex justify-between font-mono text-[10px] text-amber-805">
                      <span>일반 쓰레기 및 먼지 (Trash Class)</span>
                      <span className="font-bold text-indigo-700">{modernTrashRatio}%</span>
                    </div>
                    <div className="w-full bg-amber-200/50 h-2.5 rounded-full overflow-hidden border border-amber-200">
                      <div className="bg-indigo-500 h-full rounded-full transition-all" style={{ width: `${modernTrashRatio}%` }}></div>
                    </div>
                  </div>

                  {/* 펫 생명체 클래스 */}
                  <div className="space-y-1">
                    <div className="flex justify-between font-mono text-[10px] text-amber-805">
                      <span>식별된 생명체 (Pet Class)</span>
                      <span className="font-bold text-emerald-700">{modernPetRatio}%</span>
                    </div>
                    <div className="w-full bg-amber-200/50 h-2.5 rounded-full overflow-hidden border border-amber-200">
                      <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${modernPetRatio}%` }}></div>
                    </div>
                  </div>

                  <div className="p-2.5 bg-emerald-50/80 border-l-2 border-emerald-500 rounded-r text-[10.5px] leading-relaxed text-emerald-900 font-medium">
                    <b>데이터 밸런스 완료:</b> 생명 안전 확보를 목표로 하는 윤리적 데이터를 고르게 학습시켜, 스스로 장애물과의 경계를 완전 파악해 충돌을 차단합니다.
                  </div>
                </div>
              )}
            </div>
          </div>

        </section>

        {/* ============================================================== */}
        {/* COLUMN 2: CENTER ARENA (8x8 Grid & Main Controls) - lg:span-5   */}
        {/* ============================================================== */}
        <section className="col-span-1 lg:col-span-12 xl:col-span-5 flex flex-col gap-6">

          {/* 거실 전경 보드 카드 */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
            
            {/* 카드 상단 헤더 */}
            <div className="px-5 py-3.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-ping"></span>
                <h3 className="font-extrabold text-slate-800 text-sm md:text-base font-display">
                  스마트 거실 전경 (8x8 지능 격자)
                </h3>
              </div>
              
              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 font-mono">
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                <span>청소율: <b className="text-indigo-600">{cleanCoverageRatio}%</b> ({actualCleanedCount}/{cleanableTilesCount}칸)</span>
              </div>
            </div>

            {/* 실제 8x8 그리드 스테이지 */}
            <div className="p-4 md:p-6 bg-slate-900 border-b border-slate-950 flex flex-col items-center justify-center relative overflow-hidden">
              
              {/* 충돌 사건 섬광 오버레이 */}
              <AnimatePresence>
                {showCollisionFlash && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.7 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="absolute inset-0 bg-red-600 z-10 pointer-events-none flex items-center justify-center"
                  >
                    <div className="text-white font-extrabold text-sm md:text-base flex items-center gap-2 bg-black/70 px-4 py-2.5 rounded-2xl border border-red-500">
                      <AlertTriangle className="w-5 h-5 text-red-400 fill-red-400" />
                      PHYSICAL COLLISION INTRUSION ALARM!
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 그리드 정육면 원통 프레임 */}
              <div className="relative w-full max-w-[320px] md:max-w-[380px] aspect-square bg-[#0f172a] p-2.5 rounded-2xl shadow-inner border-[5px] border-slate-800">
                <div className="grid grid-cols-8 grid-rows-8 h-full w-full gap-1">
                  {Array(8).fill(null).map((_, y) => 
                    Array(8).fill(null).map((_, x) => {
                      const isObstacle = grid[y][x] === 1;
                      const isRobot = robotX === x && robotY === y;
                      const isPet = petX === x && petY === y;
                      const isCleaned = cleaned[y][x];
                      
                      // 센서 빔 조사 범위 하이라이팅 연산
                      const isSensed = sensorBeamList.some(([sy, sx]) => sy === y && sx === x);
                      
                      return (
                        <div
                          key={`cell-${y}-${x}`}
                          id={`grid-cell-${y}-${x}`}
                          onClick={() => handleCellClick(y, x)}
                          className={`
                            relative rounded-md cursor-pointer transition-all duration-300 aspect-square flex items-center justify-center text-xs select-none
                            ${isObstacle 
                              ? 'bg-gradient-to-br from-indigo-300 via-indigo-400 to-indigo-500 border-b-4 border-indigo-755 text-white shadow-md hover:brightness-110' 
                              : isCleaned 
                                ? 'bg-[#1e293b]/45 border border-indigo-900/30 hover:bg-[#1e293b]/70' 
                                : 'bg-[#18233c]/60 border border-slate-800/40 hover:bg-[#1e2a47]'
                            }
                            ${isSensed && showLaserBeam && perceptionOn ? 'ring-2 ring-yellow-400 bg-yellow-500/15 z-20 shadow-lg shadow-yellow-505' : ''}
                          `}
                          title={`좌표: (${x}, ${y})`}
                        >
                          {/* 청소완료 이력 점 표시 */}
                          {isCleaned && !isObstacle && !isRobot && !isPet && (
                            <motion.div 
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="w-2 h-2 rounded-full bg-cyan-400 shadow-md" 
                            />
                          )}

                          {/* 장애물 아이콘 */}
                          {isObstacle && (
                            <span className="text-white font-extrabold text-[9px] pointer-events-none md:text-2xs">🧱</span>
                          )}

                          {/* 반려동물 아이콘 */}
                          {isPet && (
                            <motion.div 
                              layoutId="pet-entity"
                              className={`absolute z-30 p-1 rounded-full shadow-md border cursor-pointer ${
                                petScaredEffect 
                                  ? 'bg-rose-500 text-white border-rose-300 animate-bounce' 
                                  : 'bg-amber-55 text-amber-800 border-amber-300 hover:scale-105'
                              }`}
                              style={{ width: '85%', height: '85%' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePetType();
                              }}
                              title="외모 교체 클릭"
                            >
                              <div className="w-full h-full flex flex-col items-center justify-center relative">
                                {petType === 'dog' ? <Dog className="w-4.5 h-4.5" /> : <Cat className="w-4.5 h-4.5" />}
                                <span className="absolute bottom-[0.5px] text-[7px] font-black tracking-tight scale-90 bg-amber-900 text-white px-0.5 rounded leading-none">
                                  {algorithmMode === 'early' && perceptionOn ? '털뭉치' : '생물체'}
                                </span>
                              </div>
                            </motion.div>
                          )}

                          {/* 지능형 로봇청소기 에이전트 본체 */}
                          {isRobot && (
                            <motion.div 
                              layoutId="agent-vacuum"
                              className="absolute w-[90%] h-[90%] z-40 rounded-full bg-gradient-to-b from-sky-400 to-indigo-600 border-2 border-white shadow-lg flex flex-col items-center justify-center text-white"
                            >
                              <div className="relative w-full h-full flex items-center justify-center">
                                {/* 방향 지시 화살표 */}
                                <div 
                                  className="absolute text-[8px] font-black transition-transform duration-300"
                                  style={{ transform: `rotate(${robotDir * 90 - 90}deg) translateY(-8px)` }}
                                >
                                  ▲
                                </div>
                                <Bot className="w-4 h-4 md:w-5 h-5 text-white" />
                                
                                {/* 스캐너 회전 파동 */}
                                {perceptionOn && isOperating && (
                                  <span className="absolute -inset-1 rounded-full border border-yellow-400 animate-ping opacity-50 pointer-events-none"></span>
                                )}
                              </div>
                            </motion.div>
                          )}

                          {/* 좌표 힌트 */}
                          <span className="absolute bottom-0 text-[6.5px] text-slate-700 right-0.5 select-none pointer-events-none font-mono">
                            {x},{y}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 하부 도움말 */}
              <div className="mt-3 text-[10px] text-slate-400 text-center flex items-center gap-1 select-none">
                <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>격자 셀을 누르면 벽(장애물 🧱)을 생성/파괴할 수 있습니다.</span>
              </div>
            </div>

            {/* 청소기 실시간 성능 통계 상황 탭 */}
            <div className="bg-[#0f172a] border-t border-slate-950 p-4 grid grid-cols-4 gap-2 text-center text-white font-sans">
              <div className="bg-slate-800/50 border border-slate-800 rounded-xl p-1.5 shadow-sm">
                <div className="text-slate-400 text-[9px] font-medium leading-tight">기동 카운터</div>
                <div className="text-white font-extrabold font-display text-xs mt-0.5">{stepCount} Tick</div>
              </div>
              <div className="bg-slate-800/50 border border-slate-800 rounded-xl p-1.5 shadow-sm">
                <div className="text-slate-400 text-[9px] font-medium leading-tight">추돌 사고</div>
                <div className={`font-extrabold font-display text-xs mt-0.5 ${collisionCount > 0 ? 'text-rose-455' : 'text-emerald-400'}`}>
                  {collisionCount}회
                </div>
              </div>
              <div className="bg-slate-800/50 border border-slate-800 rounded-xl p-1.5 shadow-sm">
                <div className="text-slate-400 text-[9px] font-medium leading-tight">자원 흡입율</div>
                <div className="text-cyan-400 font-extrabold font-display text-xs mt-0.5">{actualCleanedCount}칸</div>
              </div>
              <div className="bg-slate-800/50 border border-slate-800 rounded-xl p-1.5 border-dashed">
                <div className="text-indigo-305 text-[9px] font-medium leading-tight text-indigo-300">지도 기억</div>
                <div className="text-indigo-400 font-extrabold text-[9px] mt-0.5">
                  {learningOn ? '🟢정상학습' : '🔴학습차단'}
                </div>
              </div>
            </div>
          </div>

          {/* 메인 기동 콘솔 룸 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.03)] flex flex-col gap-3">
            
            <h3 className="font-extrabold text-slate-800 text-sm flex items-center justify-between font-display border-b border-slate-100 pb-2">
              <span className="flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-indigo-600" />
                시뮬레이터 기동 통제석
              </span>
              
              <div className="flex items-center gap-1">
                {['default', 'maze', 'empty'].map((presetKey) => (
                  <button
                    key={presetKey}
                    onClick={() => loadPresetMap(presetKey)}
                    className={`px-2 py-1 rounded-md text-[9px] font-black border transition-all cursor-pointer ${
                      activePreset === presetKey
                        ? 'bg-slate-800 text-white border-slate-850 shadow'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                    }`}
                  >
                    {MAP_PRESETS[presetKey].name}
                  </button>
                ))}
              </div>
            </h3>

            {/* 작동 제어 버튼 버튼 모음 */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setIsOperating(!isOperating)}
                  className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md transition-all focus:ring-2 ${
                    isOperating 
                      ? 'bg-amber-500 hover:bg-amber-600 text-white focus:ring-amber-300' 
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-300'
                  }`}
                >
                  {isOperating ? (
                    <>
                      <Pause className="w-4 h-4 fill-white" />
                      일시정지 (Pause)
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-white" />
                      시작 (Auto Run)
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    setIsOperating(false);
                    computeSimulationStep();
                  }}
                  disabled={isOperating}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40 shadow-sm transition-all"
                  title="한 기동 단위만 단계 진행합니다"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  1단계 진행 (Step)
                </button>

                <button
                  onClick={resetOperationConsole}
                  className="px-3 py-2 rounded-xl border border-slate-100 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs flex items-center gap-1 cursor-pointer shadow-sm transition-all"
                  title="맵 구조 및 청소 상태 초기화"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  전체 초기화 (Reset)
                </button>
              </div>

              {/* 동기 연전속 제어 슬라이드 */}
              <div className="flex items-center gap-2 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-150">
                <span className="text-[9px] text-slate-500 font-bold whitespace-nowrap">주행 주기 속도:</span>
                <input 
                  type="range"
                  min="200"
                  max="1500"
                  step="100"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-16 md:w-20 cursor-pointer accent-indigo-600"
                />
                <span className="text-[9px] font-mono font-bold text-indigo-600 whitespace-nowrap">
                  {speed}ms
                </span>
              </div>
            </div>

          </div>

        </section>

        {/* ============================================================== */}
        {/* COLUMN 3: RIGHT PANEL (Feedback monitor & Logs) - lg:span-4    */}
        {/* ============================================================== */}
        <section className="col-span-1 lg:col-span-12 xl:col-span-4 flex flex-col gap-6">

          {/* 에이전트 전용 텔레메트리 연산 분석 판넬 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.03)] flex flex-col gap-3">
            <h4 className="font-extrabold text-sm text-slate-800 border-b border-indigo-50 pb-2 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-indigo-605" />
              실시간 AI 피드백 루프 모니터
            </h4>

            <div className="flex flex-col gap-2.5 font-mono text-xs">
              
              {/* 인식 단계 */}
              <div className={`p-2.5 rounded-xl border transition-all ${perceptionOn ? 'bg-sky-50/50 border-sky-100 text-sky-950' : 'bg-rose-50 border-rose-200 text-rose-950 font-bold'}`}>
                <div className="flex items-center justify-between font-extrabold mb-1">
                  <span className="flex items-center gap-1 text-[11px]">
                    <span className={`w-2 h-2 rounded-full ${perceptionOn ? 'bg-sky-500' : 'bg-rose-500 animate-pulse'}`} />
                    1. 인식 (Perception)
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-sans ${perceptionOn ? 'bg-sky-100 text-sky-700' : 'bg-red-500 text-white animate-pulse'}`}>
                    {perceptionOn ? '정상 작동' : '결함 주입'}
                  </span>
                </div>
                <p className="font-semibold text-slate-700 text-[10.5px] leading-snug mt-1">{telemetry.perception}</p>
              </div>

              {/* 판단 단계 */}
              <div className={`p-2.5 rounded-xl border transition-all ${judgmentOn ? 'bg-purple-50/50 border-purple-100 text-purple-950' : 'bg-rose-50 border-rose-200 text-rose-950 font-bold'}`}>
                <div className="flex items-center justify-between font-extrabold mb-1">
                  <span className="flex items-center gap-1 text-[11px]">
                    <span className={`w-2 h-2 rounded-full ${judgmentOn ? 'bg-purple-500' : 'bg-rose-500 animate-pulse'}`} />
                    2. 판단 (Judgment)
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-sans ${judgmentOn ? 'bg-purple-100 text-purple-700' : 'bg-red-500 text-white animate-pulse'}`}>
                    {judgmentOn ? '정상 작동' : '결함 주입'}
                  </span>
                </div>
                <p className="font-semibold text-slate-700 text-[10.5px] leading-snug mt-1">{telemetry.judgment}</p>
              </div>

              {/* 행동 단계 */}
              <div className={`p-2.5 rounded-xl border transition-all ${actionOn ? 'bg-emerald-50/50 border-emerald-100 text-emerald-950' : 'bg-rose-50 border-rose-200 text-rose-950 font-bold'}`}>
                <div className="flex items-center justify-between font-extrabold mb-1">
                  <span className="flex items-center gap-1 text-[11px]">
                    <span className={`w-2 h-2 rounded-full ${actionOn ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
                    3. 행동 (Action)
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-sans ${actionOn ? 'bg-emerald-100 text-emerald-700' : 'bg-red-500 text-white animate-pulse'}`}>
                    {actionOn ? '정상 작동' : '결함 주입'}
                  </span>
                </div>
                <p className="font-semibold text-slate-700 text-[10.5px] leading-snug mt-1">{telemetry.action}</p>
              </div>

              {/* 학습 단계 */}
              <div className={`p-2.5 rounded-xl border transition-all ${learningOn ? 'bg-indigo-50/50 border-indigo-100 text-indigo-950' : 'bg-rose-50 border-rose-200 text-rose-950 font-bold'}`}>
                <div className="flex items-center justify-between font-extrabold mb-1">
                  <span className="flex items-center gap-1 text-[11px]">
                    <span className={`w-2 h-2 rounded-full ${learningOn ? 'bg-indigo-505' : 'bg-rose-500 animate-pulse'}`} />
                    4. 학습 (Learning)
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-sans ${learningOn ? 'bg-indigo-100 text-indigo-700' : 'bg-red-500 text-white animate-pulse'}`}>
                    {learningOn ? '정상 작동' : '결함 주입'}
                  </span>
                </div>
                <p className="font-semibold text-slate-700 text-[10.5px] leading-snug mt-1">{telemetry.learning}</p>
              </div>

            </div>

            {/* 교과 과정 핵심 안내 마크업 */}
            <div className="bg-slate-50 rounded-xl p-2.5 text-[10.5px] border border-slate-200 flex flex-col gap-1 select-none">
              <span className="text-indigo-600 font-extrabold">🏫 고등정보 관찰포인트:</span>
              <p className="text-slate-600 leading-normal font-sans">
                각 인프라 루프의 단계를 <b>OFF(결함)</b> 하게 만들면 장벽과 무덤에 무기한 들이박는 탈선 거동이나 제자리 빙글 등의 연쇄 장애를 쉽게 관찰할 수 있게 됩니다.
              </p>
            </div>
          </div>

          {/* 4. 실시간 가상 터미널 로그 블랙박스 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.03)] flex flex-col gap-2">
            <span className="text-xs font-bold text-slate-600 flex items-center gap-1 font-mono">
              📟 실시간 동작 감시 로그 터미널
            </span>
            
            <div className="bg-[#0b0f19] text-slate-50 p-4 rounded-2xl font-mono text-[10.5px] h-[240px] overflow-y-auto space-y-2 shadow-inner border border-slate-850">
              {logs.length === 0 ? (
                <div className="text-slate-500 italic">로그가 소멸되었습니다. 기동 주행을 전원 시작하세요.</div>
              ) : (
                logs.map((log, index) => {
                  let textStyle = "text-slate-300";
                  if (log.includes("🚨") || log.includes("PHYSICAL COLLISION") || log.includes("부딪") || log.includes("결함")) {
                    textStyle = index === 0 ? "text-red-300 font-black animate-pulse" : "text-red-400";
                  } else if (log.includes("인식") || log.includes("Perception") || log.includes("빔")) {
                    textStyle = index === 0 ? "text-indigo-300 font-black" : "text-slate-400";
                  } else if (log.includes("판단") || log.includes("Judgment") || log.includes("방향을")) {
                    textStyle = index === 0 ? "text-purple-300 font-black" : "text-purple-400";
                  } else if (log.includes("행동") || log.includes("Action") || log.includes("기동") || log.includes("직진") || log.includes("선회")) {
                    textStyle = index === 0 ? "text-amber-300 font-black" : "text-amber-400";
                  } else if (log.includes("학습") || log.includes("Learning") || log.includes("지도") || log.includes("흔적")) {
                    textStyle = index === 0 ? "text-cyan-300 font-black" : "text-cyan-400";
                  } else if (log.includes("시스템") || log.includes("초기화") || log.includes("리셋") || log.includes("성공적으로") || log.includes("대상이") || log.includes("구동(ON)")) {
                    textStyle = index === 0 ? "text-emerald-300 font-black" : "text-emerald-500";
                  } else if (index === 0) {
                    textStyle = "text-white font-extrabold";
                  }

                  return (
                    <div key={`log-${index}`} className={`mr-1 leading-relaxed ${textStyle}`}>
                      &gt; {log}
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </section>

      </main>

      {/* ============================================================== */}
      {/* FOOTER & EDUCATIONAL TEACHBOOK                                  */}
      {/* ============================================================== */}
      <footer id="educational-help" className="mt-auto bg-white text-slate-700 border-t border-slate-200 p-6 md:p-8 select-none">
        <div className="max-w-7xl mx-auto flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="flex items-center gap-2 mb-2 text-indigo-600">
                <Eye className="w-5 h-5 shrink-0" />
                <h4 className="font-extrabold text-sm text-slate-800">1단계: 인식 (Perception)</h4>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-sans">
                에이전트가 <b>센서(LIDAR, 초음파 센싱 장치 등)</b>를 활용해 거리를 파악하고 주변 가구들을 안전 계측하는 현실 변수 수집 과정입니다. 인식 기능이 동작하지 못할 시 시각 정보 마비로 모든 주위 장벽에 연속 추돌합니다.
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="flex items-center gap-2 mb-2 text-purple-600">
                <Brain className="w-5 h-5 shrink-0" />
                <h4 className="font-extrabold text-sm text-slate-800">2단계: 판단 (Judgment)</h4>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-sans">
                수렴된 지형 지식물리학적 인자를 규칙에 부쳐 <b>논리 연산 분기 (IF-THEN 전략 주행 설계)</b>에 맞게 어떤 행동 전략을 구사할지 추론하는 마음입니다. 맹성 결함이 기인될 시 무한 제자리 회전 방황 유해가 나타납니다.
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="flex items-center gap-2 mb-2 text-emerald-600">
                <Cpu className="w-5 h-5 shrink-0" />
                <h4 className="font-extrabold text-sm text-slate-800">3단계: 행동 (Action)</h4>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-sans">
                판단 정점에 도달한 명령 변치(방향 수정, 진로 개진)를 바퀴 구동 모터 등의 <b>하드웨어 액추에이터 구동</b>으로 변환시켜 물질적 실재 변위를 이룩합니다. 행동 모터 제어 차단 시 제자리 정립 마비를 타게 됩니다.
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="flex items-center gap-2 mb-2 text-indigo-200 text-indigo-650">
                <Map className="w-5 h-5 shrink-0" />
                <h4 className="font-extrabold text-sm text-slate-800">4단계: 학습 (Learning)</h4>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-sans">
                밟고 주행한 최단 선형 보드를 <b>실적 지도 정보(기록 저장고)</b>에 갱신 및 축적하여 반복 주행의 에너지 낭비를 스스로 축소하는 지능형 성과 기억입니다. 이 부분이 부재하면 같은 구역만 반복적으로 세척 보수합니다.
              </p>
            </div>

          </div>

          <div className="p-5 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-slate-700 flex flex-col gap-2.5">
            <span className="font-extrabold text-amber-900 flex items-center gap-1.5 font-display text-sm">
              <Sparkles className="w-4.5 h-4.5 text-amber-600" />
              수업 교재 요약 지침서 : 인공지능 학습 데이터의 편향성 해결 과제
            </span>
            <p className="leading-relaxed">
              본 웹 시뮬레이터에서 <b>초창기 모드(Early Model)</b>는 AI 에이전트 인식이 가령 '거대 털 뭉치'와 '반려동물'의 형체 차이를 인지할 만큼 충분하지 않은 데이터로 학습되었을 때의 유해 작동을 묘사합니다. 
              학습 데이터에서 반려동물을 아예 제외해서 가르친 한계 가정이 존재하기 때문에 반려동물을 유기 장애물 쓰레기로 인지하며 우회하지 않고 추격 추돌 행동을 취하게 됩니다. 
              이를 통해 <b>공명한 학습 데이터의 불균형 해소 및 안전성 관리(AI Ethics)</b>가 지능화 기동 시스템 구축 과정에 얼마나 중대한 책무인지 학생들과 자유롭게 토론해 볼 수 있습니다.
            </p>
          </div>

          <p className="text-center text-[11px] text-slate-400 border-t border-slate-250 pt-5 mt-2">
            지능 에이전트 인터랙티브 교육 시뮬레이터 © 2026 Highschool Information AI Practice Lab. All rights reserved.
          </p>
        </div>
      </footer>

    </div>
  );
}
