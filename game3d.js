const CDN_BASE_URL = 'https://pub-2d994ab822d5426bad338ecb218683d8.r2.dev';

let preloadedAssets = {
    characterModel: null,
    animations: {},
    scene: null,
    renderer: null,
    camera: null,
    terrain: null,
    lights: [],
    isLoaded: false,
    isLoading: false
};

function updateInitialLoadingProgress(progress, text, detail = '') {
    const bar = document.getElementById('initialLoadingBar');
    const textEl = document.getElementById('initialLoadingText');
    const detailEl = document.getElementById('initialLoadingDetail');
    
    if (bar) bar.style.width = `${progress}%`;
    if (textEl) textEl.textContent = text;
    if (detailEl) detailEl.textContent = detail;
}

async function preloadGameAssets() {
    if (preloadedAssets.isLoaded || preloadedAssets.isLoading) {
        return preloadedAssets;
    }
    
    preloadedAssets.isLoading = true;
    console.log('Starting parallel asset preload...');
    const startTime = performance.now();
    
    try {
        updateInitialLoadingProgress(0, 'Loading character animations...', 'Downloading FBX files...');
        
        const loader = new THREE.FBXLoader();
        const animationFiles = {
            idle: `${CDN_BASE_URL}/Animation_Idle_frame_rate_60.fbx`,
            run: `${CDN_BASE_URL}/Animation_Run_60.fbx`,
            death: `${CDN_BASE_URL}/Animation_Death_60.fbx`
        };
        
        let loadedCount = 0;
        const totalFiles = Object.keys(animationFiles).length;
        
        const loadPromises = Object.entries(animationFiles).map(([key, file]) => {
            return new Promise((resolve, reject) => {
                loader.load(file, (fbx) => {
                    if (key === 'idle') {
                        preloadedAssets.characterModel = fbx;
                    }
                    preloadedAssets.animations[key] = fbx.animations[0];
                    loadedCount++;
                    const progress = Math.floor((loadedCount / totalFiles) * 60);
                    updateInitialLoadingProgress(progress, 'Loading character animations...', `Loaded ${key} animation (${loadedCount}/${totalFiles})`);
                    console.log(`Preloaded: ${key} Animation`);
                    resolve();
                }, undefined, reject);
            });
        });
        
        await Promise.all(loadPromises);
        
        updateInitialLoadingProgress(60, 'Initializing 3D engine...', 'Setting up Three.js renderer...');
        await new Promise(resolve => setTimeout(resolve, 50)); // Allow UI update
        
        preloadedAssets.scene = new THREE.Scene();
        preloadedAssets.scene.background = new THREE.Color(0x000000);
        
        preloadedAssets.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true,
            powerPreference: "high-performance"
        });
        preloadedAssets.renderer.setSize(window.innerWidth, window.innerHeight);
        preloadedAssets.renderer.shadowMap.enabled = false;
        
        preloadedAssets.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        preloadedAssets.camera.position.set(0, 15, 20);
        preloadedAssets.camera.lookAt(0, 0, 0);
        
        console.log('Three.js scene initialized');
        
        updateInitialLoadingProgress(70, 'Setting up lighting...', 'Creating ambient and directional lights...');
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 2.5);
        preloadedAssets.scene.add(ambientLight);
        preloadedAssets.lights.push(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight.position.set(10, 20, 10);
        directionalLight.castShadow = false;
        preloadedAssets.scene.add(directionalLight);
        preloadedAssets.lights.push(directionalLight);
        
        console.log('Lighting setup complete');
        
        updateInitialLoadingProgress(80, 'Building game terrain...', 'Loading 3D map model...');
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const gltfLoader = new THREE.GLTFLoader();
        await new Promise((resolve, reject) => {
            gltfLoader.load(`${CDN_BASE_URL}/new_map.glb`, (gltf) => {
                const mapModel = gltf.scene;
                
                const box = new THREE.Box3().setFromObject(mapModel);
                const size = new THREE.Vector3();
                box.getSize(size);
                
                const scaleX = 200 / size.x;
                const scaleZ = 150 / size.z;
                const uniformScale = Math.min(scaleX, scaleZ);
                
                mapModel.scale.set(uniformScale, uniformScale, uniformScale);
                mapModel.rotation.y = Math.PI / 2;
                mapModel.position.y = 0;
                
                mapModel.traverse((child) => {
                    if (child.isMesh) {
                        if (child.name === 'Mesh_0' && child.material) {
                            child.material.color.set(0x4db8ff);
                            child.material.needsUpdate = true;
                        }
                    }
                });
                
                preloadedAssets.scene.add(mapModel);
                
                const scaledBox = new THREE.Box3().setFromObject(mapModel);
                const scaledSize = new THREE.Vector3();
                scaledBox.getSize(scaledSize);
                
                const groundSurfaceY = scaledBox.max.y;
                
                const invisibleGroundGeometry = new THREE.PlaneGeometry(500, 500);
                const invisibleGroundMaterial = new THREE.MeshBasicMaterial({ 
                    color: 0x000000, 
                    transparent: true, 
                    opacity: 0,
                    side: THREE.DoubleSide
                });
                const invisibleGround = new THREE.Mesh(invisibleGroundGeometry, invisibleGroundMaterial);
                invisibleGround.rotation.x = -Math.PI / 2;
                invisibleGround.position.y = groundSurfaceY;
                preloadedAssets.scene.add(invisibleGround);
                
                preloadedAssets.terrain = {
                    ground: mapModel,
                    invisibleGround: invisibleGround,
                    groundSurfaceY: groundSurfaceY
                };
                
                console.log('3D map model loaded and added to scene');
                resolve();
            }, undefined, (error) => {
                console.error('Error loading GLB map during preload:', error);
                reject(error);
            });
        });
        
        updateInitialLoadingProgress(100, 'Ready to play!', 'All assets loaded successfully');
        await new Promise(resolve => setTimeout(resolve, 200));
        
        preloadedAssets.isLoaded = true;
        preloadedAssets.isLoading = false;
        const loadTime = ((performance.now() - startTime) / 1000).toFixed(2);
        console.log(`All assets preloaded successfully in ${loadTime}s!`);
    } catch (error) {
        console.error('Asset preload failed:', error);
        preloadedAssets.isLoading = false;
        updateInitialLoadingProgress(0, 'Loading failed', error.message);
    }
    
    return preloadedAssets;
}

class MundoKnifeGame3D {
    constructor(mode = 'practice', isMultiplayer = false, isHostPlayer = false, practiceMode = '1v1') {
        this.gameMode = mode;
        this.isMultiplayer = isMultiplayer;
        this.isHost = isHostPlayer;
        this.practiceMode = practiceMode;
        this.lastTime = performance.now();
        this.accumulator = 0.0;
        this.fixedDt = this.getPlatformAdjustedTimestep();
        this.currentState = null;
        this.previousState = null;
        
        
        this.eventListeners = {
            documentContextMenu: null,
            canvasContextMenu: null,
            keydown: null,
            keyup: null,
            mousemove: null,
            resize: null
        };
        
        this.loadingProgress = {
            total: 1,
            loaded: 0,
            currentAsset: ''
        };
        
        this.fpsData = {
            frames: 0,
            lastFpsUpdate: performance.now()
        };
        
        this.showLoadingOverlay();
        
        this.loadingTimeout = setTimeout(() => {
            this.hideLoadingOverlay();
        }, 15000);
        
        if (preloadedAssets.scene && preloadedAssets.renderer && preloadedAssets.camera) {
            console.log('Using preloaded scene, renderer, and camera');
            this.scene = preloadedAssets.scene;
            this.renderer = preloadedAssets.renderer;
            this.camera = preloadedAssets.camera;
            
            const canvas = document.getElementById('gameCanvas');
            if (canvas && !canvas.firstChild) {
                canvas.appendChild(this.renderer.domElement);
            }
            
            if (preloadedAssets.terrain) {
                console.log('Using preloaded terrain');
                this.ground = preloadedAssets.terrain.ground;
                this.invisibleGround = preloadedAssets.terrain.invisibleGround;
                this.groundSurfaceY = preloadedAssets.terrain.groundSurfaceY;
            }
        } else {
            console.log('Preloaded assets not available, creating new scene');
            this.setupThreeJS();
        }
        
        this.loadCharacterAnimations().then(() => {
            this.initializeGame();
            this.setupCamera();
            this.setupEventListeners();
            this.setupMultiplayerEvents();
            this.gameLoop();
            if (this.loadingTimeout) {
                clearTimeout(this.loadingTimeout);
            }
            
            if (this.isMultiplayer && socket && roomCode) {
                console.log('Emitting playerLoaded event for room:', roomCode);
                socket.emit('playerLoaded', { roomCode });
                this.updateLoadingStatus();
            } else {
                console.log('Single player mode or missing socket/roomCode, hiding loading overlay');
                this.hideLoadingOverlay();
            }
        }).catch(error => {
            console.error('Failed to load character animations:', error);
            console.log('Initializing game with fallback assets...');
            this.initializeGame();
            this.setupCamera();
            this.setupEventListeners();
            this.setupMultiplayerEvents();
            this.gameLoop();
            if (this.loadingTimeout) {
                clearTimeout(this.loadingTimeout);
            }
            
            if (this.isMultiplayer && socket && roomCode) {
                console.log('Emitting playerLoaded event for room:', roomCode);
                socket.emit('playerLoaded', { roomCode });
                this.updateLoadingStatus();
            } else {
                console.log('Single player mode or missing socket/roomCode, hiding loading overlay');
                this.hideLoadingOverlay();
            }
        });
    }

    getPlatformAdjustedTimestep() {
        return 0.008;
    }

    showLoadingOverlay() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
        }
        
        if (this.isMultiplayer) {
            const statusContainer = document.getElementById('playerLoadingStatus');
            if (statusContainer) {
                statusContainer.style.display = 'block';
            }
        }
    }

    hideLoadingOverlay() {
        console.log('hideLoadingOverlay() called, isMultiplayer:', this.isMultiplayer);
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
        
        const statusContainer = document.getElementById('playerLoadingStatus');
        if (statusContainer) {
            statusContainer.style.display = 'none';
        }
        
        const loadingVideo = document.querySelector('#loadingOverlay video');
        if (loadingVideo) {
            loadingVideo.pause();
            loadingVideo.style.display = 'none';
        }
        const mainMenuVideo = document.querySelector('.main-menu-video');
        if (mainMenuVideo) {
            mainMenuVideo.pause();
            mainMenuVideo.style.display = 'none';
        }
        
        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer) {
            gameContainer.style.display = 'block';
        }
        const gameCanvas = document.getElementById('gameCanvas');
        if (gameCanvas) {
            gameCanvas.style.display = 'block';
        }
    }
    
    updateLoadingStatus() {
        const statusContainer = document.getElementById('playerLoadingStatus');
        if (!statusContainer) return;
        
        statusContainer.style.display = 'block';
    }

    updateLoadingProgress(assetName) {
        this.loadingProgress.loaded++;
        this.loadingProgress.currentAsset = assetName;
        
        const percentage = Math.round((this.loadingProgress.loaded / this.loadingProgress.total) * 100);
        
        const loadingBar = document.getElementById('loadingBar');
        const loadingText = document.getElementById('loadingText');
        const loadingAsset = document.getElementById('loadingAsset');
        
        if (loadingBar) loadingBar.style.width = percentage + '%';
        if (loadingText) loadingText.textContent = `Loading assets...`;
        if (loadingAsset) loadingAsset.textContent = assetName;
        
        if (percentage >= 100) {
            console.log('Loading progress reached 100%');
            if (!this.isMultiplayer) {
                console.log('Single player mode, hiding loading overlay in 500ms');
                setTimeout(() => {
                    if (this.loadingTimeout) {
                        clearTimeout(this.loadingTimeout);
                    }
                    console.log('Calling hideLoadingOverlay() from updateLoadingProgress');
                    this.hideLoadingOverlay();
                }, 500);
            } else {
                console.log('Multiplayer mode, NOT hiding loading overlay automatically');
            }
        }
    }

    async loadCharacterAnimations() {
        if (preloadedAssets.isLoaded) {
            console.log('Using preloaded assets');
            this.characterModel = preloadedAssets.characterModel;
            this.animations = preloadedAssets.animations;
            this.updateLoadingProgress('Idle Animation');
            this.updateLoadingProgress('Running Animation');
            this.updateLoadingProgress('Death Animation');
            return Promise.resolve();
        }
        
        const loader = new THREE.FBXLoader();
        
        const animationFiles = {
            idle: `${CDN_BASE_URL}/Animation_Idle_frame_rate_60.fbx`,
            run: `${CDN_BASE_URL}/Animation_Run_60.fbx`,
            death: `${CDN_BASE_URL}/Animation_Death_60.fbx`
        };
        
        this.characterModel = null;
        this.animations = {};
        
        return new Promise((resolve, reject) => {
            loader.load(animationFiles.idle, (fbx) => {
                this.characterModel = fbx;
                this.animations.idle = fbx.animations[0];
                this.updateLoadingProgress('Idle Animation');
                
                let loaded = 1;
                const total = Object.keys(animationFiles).length;
                
                Object.entries(animationFiles).forEach(([key, file]) => {
                    if (key === 'idle') return;
                    
                    loader.load(file, (animFbx) => {
                        this.animations[key] = animFbx.animations[0];
                        loaded++;
                        
                        const assetNames = {
                            'run': 'Running Animation',
                            'death': 'Death Animation'
                        };
                        this.updateLoadingProgress(assetNames[key] || `${key} Animation`);
                        
                        if (loaded === total) {
                            resolve();
                        }
                    }, undefined, reject);
                });
            }, undefined, reject);
        });
    }

    setupThreeJS() {
        this.container = document.getElementById('gameCanvas');
        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        
        this.camera = new THREE.PerspectiveCamera(
            75, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            10000
        );
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = false;
        this.canvas = this.renderer.domElement;
        this.container.appendChild(this.renderer.domElement);
        
        this.setupLighting();
        this.setupTerrain();
    }

    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 2.5);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight.position.set(50, 100, 50);
        directionalLight.castShadow = false;
        this.scene.add(directionalLight);
        
        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight2.position.set(-50, 80, -50);
        directionalLight2.castShadow = false;
        this.scene.add(directionalLight2);
    }

    setupTerrain() {
        const loader = new THREE.GLTFLoader();
        
        loader.load(`${CDN_BASE_URL}/new_map.glb`, (gltf) => {
            this.updateLoadingProgress('Game Map');
            const mapModel = gltf.scene;
            
            const box = new THREE.Box3().setFromObject(mapModel);
            const size = new THREE.Vector3();
            box.getSize(size);
            
            const scaleX = 200 / size.x;
            const scaleZ = 150 / size.z;
            const uniformScale = Math.min(scaleX, scaleZ);
            
            mapModel.scale.set(uniformScale, uniformScale, uniformScale);
            mapModel.rotation.y = Math.PI / 2;
            mapModel.position.y = 0;
            
            mapModel.traverse((child) => {
                if (child.isMesh) {
                    if (child.name === 'Mesh_0' && child.material) {
                        child.material.color.set(0x4db8ff);
                        child.material.needsUpdate = true;
                    }
                }
            });
            
            this.scene.add(mapModel);
            this.ground = mapModel;
            
            const scaledBox = new THREE.Box3().setFromObject(mapModel);
            const scaledSize = new THREE.Vector3();
            scaledBox.getSize(scaledSize);
            
            this.groundSurfaceY = scaledBox.max.y;
            
            const invisibleGroundGeometry = new THREE.PlaneGeometry(500, 500);
            const invisibleGroundMaterial = new THREE.MeshBasicMaterial({ 
                color: 0x000000, 
                transparent: true, 
                opacity: 0,
                side: THREE.DoubleSide
            });
            this.invisibleGround = new THREE.Mesh(invisibleGroundGeometry, invisibleGroundMaterial);
            this.invisibleGround.rotation.x = -Math.PI / 2;
            this.invisibleGround.position.y = this.groundSurfaceY;
            this.scene.add(this.invisibleGround);
            
        }, undefined, (error) => {
            console.error('Error loading GLB map:', error);
            this.setupOriginalTerrain();
        });
    }
    
    setupOriginalTerrain() {
        const groundGeometry = new THREE.PlaneGeometry(200, 150);
        const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x2d5016 });
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);
        
        const invisibleGroundGeometry = new THREE.PlaneGeometry(500, 500);
        const invisibleGroundMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x000000, 
            transparent: true, 
            opacity: 0,
            side: THREE.DoubleSide
        });
        this.invisibleGround = new THREE.Mesh(invisibleGroundGeometry, invisibleGroundMaterial);
        this.invisibleGround.rotation.x = -Math.PI / 2;
        this.invisibleGround.position.y = 0;
        this.scene.add(this.invisibleGround);
    }

    generateMissPattern() {
        const missIndices = [];
        while (missIndices.length < 4) {
            const randomIndex = Math.floor(Math.random() * 7);
            if (!missIndices.includes(randomIndex)) {
                missIndices.push(randomIndex);
            }
        }
        return missIndices.sort((a, b) => a - b);
    }


    generateTeamSpawnPositions(mode) {
        const positions = { team1: [], team2: [] };
        
        if (mode === '1v1') {
            const zBounds = { zMin: -32, zMax: 32 };
            const player1Bounds = { xMin: -42, xMax: -25 };
            const player2Bounds = { xMin: 25, xMax: 42 };
            
            positions.team1.push({
                x: Math.random() * (player1Bounds.xMax - player1Bounds.xMin) + player1Bounds.xMin,
                z: Math.random() * (zBounds.zMax - zBounds.zMin) + zBounds.zMin,
                facing: 1
            });
            
            positions.team2.push({
                x: Math.random() * (player2Bounds.xMax - player2Bounds.xMin) + player2Bounds.xMin,
                z: Math.random() * (zBounds.zMax - zBounds.zMin) + zBounds.zMin,
                facing: -1
            });
        } else if (mode === '3v3') {
            const team1BaseX = -35;
            const team2BaseX = 35;
            const spacing = 15;
            
            positions.team1.push(
                { x: team1BaseX, z: 0, facing: 1 },
                { x: team1BaseX - 8, z: -spacing, facing: 1 },
                { x: team1BaseX - 8, z: spacing, facing: 1 }
            );
            
            positions.team2.push(
                { x: team2BaseX, z: 0, facing: -1 },
                { x: team2BaseX + 8, z: -spacing, facing: -1 },
                { x: team2BaseX + 8, z: spacing, facing: -1 }
            );
        }
        
        return positions;
    }

    isWithinMapBounds(x, z, player) {
        const characterRadius = 6;
        
        if (Math.abs(x) < 18) {
            return false;
        }
        
        if (player.team === 1 && x > -18) {
            return false;
        }
        if (player.team === 2 && x < 18) {
            return false;
        }
        
        if (Math.abs(x) > 80 - characterRadius || Math.abs(z) > 68) {
            return false;
        }
        
        const cornerDistance = Math.abs(x) + Math.abs(z);
        if (cornerDistance > 120) {
            return false;
        }
        
        return true;
    }

    initializeGame() {
        this.gameState = {
            isRunning: false,
            winner: null,
            countdownActive: false,
            gameStarted: false
        };

        this.latencyData = {
            lastPingTime: 0,
            currentLatency: 0,
            pingInterval: null
        };

        this.particles = [];
        this.characterSize = 10.5;
        this.knifeSpawnHeight = null;
        this.actualModelHeight = null;
        
        const spawnPositions = this.generateTeamSpawnPositions(this.practiceMode);
        
        this.team1 = [];
        this.team2 = [];
        
        spawnPositions.team1.forEach((pos, index) => {
            const player = {
                x: pos.x,
                y: 0,
                z: pos.z,
                health: 5,
                maxHealth: 5,
                color: 0xFFFFFF,
                facing: pos.facing,
                rotation: 0,
                isMoving: false,
                targetX: null,
                targetZ: null,
                moveSpeed: 0.39,
                lastKnifeTime: 0,
                knifeCooldown: 5000,
                mesh: null,
                canAttack: index === 0,
                isThrowingKnife: false,
                mixer: null,
                animations: {},
                currentAnimation: null,
                animationState: 'idle',
                isHuman: index === 0,
                isAI: index !== 0,
                team: 1,
                playerIndex: index
            };
            
            if (index !== 0) {
                player.aiStartDelay = 0;
                player.aiCanAttack = false;
                player.throwCount = 0;
                player.missPattern = this.generateMissPattern();
            }
            
            this.team1.push(player);
        });
        
        spawnPositions.team2.forEach((pos, index) => {
            const player = {
                x: pos.x,
                y: 0,
                z: pos.z,
                health: 5,
                maxHealth: 5,
                color: 0xFFFFFF,
                facing: pos.facing,
                rotation: 0,
                isMoving: false,
                targetX: null,
                targetZ: null,
                moveSpeed: 0.39,
                lastKnifeTime: 0,
                knifeCooldown: 5000,
                mesh: null,
                aiStartDelay: 0,
                aiCanAttack: false,
                isThrowingKnife: false,
                mixer: null,
                animations: {},
                currentAnimation: null,
                animationState: 'idle',
                throwCount: 0,
                missPattern: this.generateMissPattern(),
                isHuman: false,
                isAI: true,
                team: 2,
                playerIndex: index
            };
            
            this.team2.push(player);
        });

        this.player1 = this.team1[0];
        this.player2 = this.team2[0];

        this.knives = [];
        
        this.killCounts = {
            team1: 0,
            team2: 0
        };

        this.keys = {};
        
        this.mouse = {
            x: 0,
            y: 0
        };
        
        this.lastMouseClientX = undefined;
        this.lastMouseClientY = undefined;

        this.raycaster = new THREE.Raycaster();
        this.mouseVector = new THREE.Vector2();
        this.mouseWorldX = 0;
        this.mouseWorldZ = 0;

        this.team1.forEach(player => this.createPlayer3D(player));
        this.team2.forEach(player => this.createPlayer3D(player));
        
        this.setupCamera();
        this.createHealthBarElements();
        this.updateHealthDisplay();
        
        if (!this.isMultiplayer) {
            console.log('Single player mode detected, starting countdown immediately');
            this.startCountdown();
        } else {
            console.log('Multiplayer mode detected, waiting for allPlayersLoaded event');
        }
        
        this.startLatencyMeasurement();
    }

    createPlayer3D(player) {
        if (!this.characterModel) {
            console.log('Character model not available, using fallback mesh');
            this.createFallbackPlayerMesh(player);
            return;
        }
        
        player.mesh = THREE.SkeletonUtils.clone(this.characterModel);
        
        const scaleValue = 0.0805;
        player.mesh.scale.set(scaleValue, scaleValue, scaleValue);
        
        player.mesh.updateMatrixWorld(true);
        const bbox = new THREE.Box3().setFromObject(player.mesh);
        const modelHeight = bbox.max.y - bbox.min.y;
        
        if (this.knifeSpawnHeight === null) {
            this.knifeSpawnHeight = modelHeight;
            this.actualModelHeight = modelHeight;
            this.characterSize = modelHeight;
        }
        
        const groundY = this.groundSurfaceY || 0;
        player.mesh.position.set(player.x, groundY, player.z);
        player.y = groundY;
        player.mesh.castShadow = false;
        
        
        player.mixer = new THREE.AnimationMixer(player.mesh);
        player.currentAnimation = null;
        player.animationState = 'idle';
        
        player.animations = {};
        player.animations.idle = player.mixer.clipAction(this.animations.idle);
        player.animations.run = player.mixer.clipAction(this.animations.run);
        player.animations.death = player.mixer.clipAction(this.animations.death);
        
        player.animations.idle.loop = THREE.LoopRepeat;
        player.animations.run.loop = THREE.LoopRepeat;
        player.animations.death.loop = THREE.LoopOnce;
        
        player.animations.idle.play();
        player.currentAnimation = player.animations.idle;
        
        this.scene.add(player.mesh);
        player.mesh.visible = true;
    }

    createFallbackPlayerMesh(player) {
        const geometry = new THREE.BoxGeometry(8, 10, 4);
        const material = new THREE.MeshLambertMaterial({ color: player.color });
        player.mesh = new THREE.Mesh(geometry, material);
        
        const groundY = this.groundSurfaceY || 0;
        player.mesh.position.set(player.x, groundY + 5, player.z);
        player.y = groundY;
        player.mesh.rotation.y = player.facing === 1 ? Math.PI / 2 : -Math.PI / 2;
        
        this.scene.add(player.mesh);
        player.mesh.visible = true;
        
        if (this.knifeSpawnHeight === null) {
            this.knifeSpawnHeight = 10;
            this.actualModelHeight = 10;
            this.characterSize = 10;
            console.log('✓ Using fallback character height: 10');
        }
        
        player.mixer = null;
        player.animations = {};
        player.currentAnimation = null;
        
        console.log('✓ Created fallback player mesh (colored cube)');
    }

    createHealthDisplay(player) {
        return null;
    }

    createHealthBarElements() {
        document.querySelectorAll('.health-bar-3d-dynamic').forEach(el => el.remove());
        
        const gameContainer = document.getElementById('gameContainer');
        
        [...this.team1, ...this.team2].forEach((player, globalIndex) => {
            const healthBarId = `healthBar3D_team${player.team}_${player.playerIndex}`;
            
            const healthBar = document.createElement('div');
            healthBar.id = healthBarId;
            healthBar.className = 'health-bar-3d health-bar-3d-dynamic';
            healthBar.style.display = 'none';
            
            for (let i = 0; i < 5; i++) {
                const segment = document.createElement('div');
                segment.className = 'health-segment';
                healthBar.appendChild(segment);
            }
            
            gameContainer.appendChild(healthBar);
            
            player.healthBarElement = healthBar;
        });
    }

    lightenColor(color, amount) {
        const c = new THREE.Color(color);
        c.r = Math.min(1, c.r + amount);
        c.g = Math.min(1, c.g + amount);
        c.b = Math.min(1, c.b + amount);
        return c.getHex();
    }

    updatePlayerAnimation(player, dt) {
        let desiredState = 'idle';
        
        if (player.health <= 0) {
            desiredState = 'death';
        } else if (player.isMoving) {
            desiredState = 'run';
        }
        
        if (player.animationState !== desiredState) {
            const oldAnimation = player.currentAnimation;
            const newAnimation = player.animations[desiredState];
            
            if (oldAnimation) {
                oldAnimation.fadeOut(0.2);
            }
            
            if (newAnimation) {
                newAnimation.reset().fadeIn(0.2);
                
                if (desiredState === 'death') {
                    newAnimation.setLoop(THREE.LoopOnce);
                    newAnimation.clampWhenFinished = true;
                }
                
                newAnimation.play();
                player.currentAnimation = newAnimation;
            }
            
            player.animationState = desiredState;
        }
        
        if (player.mixer) {
            player.mixer.update(dt);
        }
    }

    setupCamera() {
        if (this.player1) {
            const groundY = this.groundSurfaceY || 0;
            const characterCenterY = groundY + (this.characterSize / 2);
            
            this.camera.position.set(
                this.player1.x,
                characterCenterY + 90,
                this.player1.z + 75
            );
            this.camera.lookAt(this.player1.x, characterCenterY, this.player1.z);
            
            this.cameraTarget = new THREE.Vector3(this.player1.x, characterCenterY, this.player1.z);
            this.cameraOffset = new THREE.Vector3(0, 90, 75);
        } else {
            this.camera.position.set(0, 90, 75);
            this.camera.lookAt(0, 0, 0);
            
            this.cameraTarget = new THREE.Vector3(0, 0, 0);
            this.cameraOffset = new THREE.Vector3(0, 90, 75);
        }
        this.cameraLerpSpeed = 0.25;
        this.cameraLocked = true;
    }

    updateCamera() {
        if (this.player1) {
            const groundY = this.groundSurfaceY || 0;
            const characterCenterY = groundY + (this.characterSize / 2);
            
            this.camera.position.set(
                this.player1.x,
                characterCenterY + 90,
                this.player1.z + 75
            );
            
            this.camera.lookAt(this.player1.x, characterCenterY, this.player1.z);
        }
    }

    setupEventListeners() {
        this.eventListeners.documentContextMenu = (e) => {
            if (e.target !== this.renderer.domElement) {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        document.addEventListener('contextmenu', this.eventListeners.documentContextMenu, true);
        
        this.eventListeners.canvasContextMenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handlePlayerMovement(e);
        };
        this.renderer.domElement.addEventListener('contextmenu', this.eventListeners.canvasContextMenu, true);
        
        this.eventListeners.keydown = (e) => {
            this.keys[e.key.toLowerCase()] = true;
            if (e.key.toLowerCase() === 'q') {
                this.throwKnifeTowardsMouse();
            }
            if (e.key.toLowerCase() === 'r') {
                if (this.gameMode === 'practice' && !this.gameState.isRunning && this.gameState.winner) {
                    if (currentGame) {
                        currentGame.dispose();
                    }
                    document.getElementById('gameOverOverlay').style.display = 'none';
                    startPractice();
                }
            }
        };
        document.addEventListener('keydown', this.eventListeners.keydown);

        this.eventListeners.keyup = (e) => {
            this.keys[e.key.toLowerCase()] = false;
        };
        document.addEventListener('keyup', this.eventListeners.keyup);

        this.eventListeners.mousemove = (e) => {
            this.lastMouseClientX = e.clientX;
            this.lastMouseClientY = e.clientY;
            
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObject(this.invisibleGround);
            
            if (intersects.length > 0) {
                this.mouseWorldX = intersects[0].point.x;
                this.mouseWorldZ = intersects[0].point.z;
            }
            
            const cursor = document.getElementById('customCursor');
            cursor.style.left = e.clientX + 'px';
            cursor.style.top = e.clientY + 'px';
        };
        document.addEventListener('mousemove', this.eventListeners.mousemove);
        
        this.eventListeners.resize = () => this.onWindowResize();
        window.addEventListener('resize', this.eventListeners.resize);
    }

    handlePlayerMovement(event) {
        if (this.player1.health <= 0) {
            return;
        }
        
        const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
        const mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
        
        this.mouse.x = mouseX;
        this.mouse.y = mouseY;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.invisibleGround);
        
        if (intersects.length > 0) {
            const point = intersects[0].point;
            
            const boundsCheck = this.isWithinMapBounds(point.x, point.z, this.player1);
            
            if (!boundsCheck) {
                return;
            }
            
            this.player1.targetX = point.x;
            this.player1.targetZ = point.z;
            this.player1.isMoving = true;
            
            if (this.isMultiplayer && socket) {
                socket.emit('playerMove', {
                    roomCode: roomCode,
                    targetX: point.x,
                    targetZ: point.z
                });
            }
        }
    }

    throwKnifeTowardsMouse() {
        if (this.player1.health <= 0) {
            return;
        }
        
        const now = Date.now();
        
        if (!this.player1.canAttack) {
            return;
        }
        
        if (now - this.player1.lastKnifeTime >= this.player1.knifeCooldown) {
            let targetX, targetZ;
            
            if (this.mouseWorldX !== undefined && this.mouseWorldZ !== undefined) {
                targetX = this.mouseWorldX;
                targetZ = this.mouseWorldZ;
            } else {
                targetX = this.player1.x + (this.player1.facing * 20);
                targetZ = this.player1.z;
            }
            
            const knifeAudio = new Audio('knife-slice-41231.mp3');
            knifeAudio.volume = 0.4;
            knifeAudio.play().catch(e => {});
            
            this.createKnife3DTowards(this.player1, targetX, targetZ, this.raycaster.ray.direction, knifeAudio);
            
            this.player1.isThrowingKnife = true;
            this.player1.isMoving = false;
            this.player1.targetX = null;
            this.player1.targetZ = null;
            this.player1.lastKnifeTime = now;
            
            setTimeout(() => {
                this.player1.isThrowingKnife = false;
            }, 2500);
            
            if (this.isMultiplayer && socket) {
                socket.emit('knifeThrow', {
                    roomCode: roomCode,
                    targetX: targetX,
                    targetZ: targetZ,
                    fromPlayer: 1
                });
            }
        }
    }

    throwKnife() {
        const now = Date.now();
        
        if (this.gameState.countdownActive) {
            return;
        }
        
        if (!this.isMultiplayer && this.player2.aiCanAttack && now - this.player2.lastKnifeTime >= this.player2.knifeCooldown) {
            let targetX = this.player1.x;
            let targetZ = this.player1.z;
            
            if (this.player1.isMoving && this.player1.targetX !== null && this.player1.targetZ !== null) {
                const dx = this.player1.targetX - this.player1.x;
                const dz = this.player1.targetZ - this.player1.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                if (distance > 0.1) {
                    const predictionTime = 0.3;
                    const predictedDistance = this.player1.moveSpeed * 60 * predictionTime;
                    const dirX = dx / distance;
                    const dirZ = dz / distance;
                    
                    targetX = this.player1.x + dirX * Math.min(predictedDistance, distance);
                    targetZ = this.player1.z + dirZ * Math.min(predictedDistance, distance);
                }
            }
            
            const shouldMiss = this.player2.missPattern.includes(this.player2.throwCount);
            
            if (shouldMiss) {
                const largeOffsetX = (Math.random() - 0.5) * 15;
                const largeOffsetZ = (Math.random() - 0.5) * 15;
                targetX += largeOffsetX;
                targetZ += largeOffsetZ;
            } else {
                const smallOffsetX = (Math.random() - 0.5) * 2;
                const smallOffsetZ = (Math.random() - 0.5) * 2;
                targetX += smallOffsetX;
                targetZ += smallOffsetZ;
            }
            
            this.player2.throwCount++;
            if (this.player2.throwCount >= 7) {
                this.player2.throwCount = 0;
                this.player2.missPattern = this.generateMissPattern();
            }
            
            const knifeAudio = new Audio('knife-slice-41231.mp3');
            knifeAudio.volume = 0.4;
            knifeAudio.play().catch(e => {});
            
            this.createKnife3DTowards(this.player2, targetX, targetZ, null, knifeAudio);
            
            this.player2.isThrowingKnife = true;
            this.player2.isMoving = false;
            this.player2.targetX = null;
            this.player2.targetZ = null;
            this.player2.lastKnifeTime = now;
            
            setTimeout(() => {
                this.player2.isThrowingKnife = false;
            }, 2500);
        }
    }

    createKnife3DTowards(fromPlayer, targetX, targetZ, rayDirection = null, audio = null) {
        const knifeGroup = new THREE.Group();
        
        const bladeGeometry = new THREE.BoxGeometry(0.3, 6, 1.2);
        const bladeMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xC0C0C0,
            emissive: 0x888888,
            emissiveIntensity: 0.5
        });
        const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
        blade.position.set(0, 2, 0);
        
        const handleGeometry = new THREE.BoxGeometry(0.4, 2.5, 0.8);
        const handleMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x4A4A4A,
            emissive: 0x2A2A2A,
            emissiveIntensity: 0.3
        });
        const handle = new THREE.Mesh(handleGeometry, handleMaterial);
        handle.position.set(0, -1.5, 0);
        
        const guardGeometry = new THREE.BoxGeometry(0.5, 0.3, 1.5);
        const guardMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x696969,
            emissive: 0x333333,
            emissiveIntensity: 0.4
        });
        const guard = new THREE.Mesh(guardGeometry, guardMaterial);
        guard.position.set(0, 0.2, 0);
        
        knifeGroup.add(blade);
        knifeGroup.add(handle);
        knifeGroup.add(guard);
        
        const spawnHeight = this.knifeSpawnHeight || this.characterSize;
        const playerY = fromPlayer.mesh ? fromPlayer.mesh.position.y : 0;
        knifeGroup.position.set(fromPlayer.x, playerY + spawnHeight, fromPlayer.z);
        knifeGroup.castShadow = true;
        
        let dx = targetX - fromPlayer.x;
        let dz = targetZ - fromPlayer.z;
        
        if (fromPlayer.isAI) {
            const inaccuracy = 0.40;
            dx += (Math.random() - 0.5) * inaccuracy * Math.sqrt(dx * dx + dz * dz);
            dz += (Math.random() - 0.5) * inaccuracy * Math.sqrt(dx * dx + dz * dz);
        }
        
        const distanceXZ = Math.sqrt(dx * dx + dz * dz);
        
        const directionXZ = {
            x: dx / (distanceXZ || 1),
            z: dz / (distanceXZ || 1)
        };
        
        const targetY = 0;
        const dy = targetY - (playerY + spawnHeight);
        
        const direction = new THREE.Vector3(directionXZ.x, dy / (distanceXZ || 1), directionXZ.z);
        
        const knifeSpeed = 4.5864;
        
        knifeGroup.lookAt(
            knifeGroup.position.x + direction.x,
            knifeGroup.position.y + direction.y,
            knifeGroup.position.z + direction.z
        );
        
        const knifeData = {
            mesh: knifeGroup,
            vx: directionXZ.x * knifeSpeed,
            vz: directionXZ.z * knifeSpeed,
            fromPlayer: fromPlayer === this.player1 ? 1 : 2,
            thrower: fromPlayer,
            audio: audio
        };
        
        this.knives.push(knifeData);
        this.scene.add(knifeGroup);
    }

    createKnife3D(fromPlayer, toPlayer) {
        const knifeGroup = new THREE.Group();
        
        const bladeGeometry = new THREE.BoxGeometry(0.3, 6, 1.2);
        const bladeMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xC0C0C0,
            emissive: 0x888888,
            emissiveIntensity: 0.5
        });
        const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
        blade.position.set(0, 2, 0);
        
        const handleGeometry = new THREE.BoxGeometry(0.4, 2.5, 0.8);
        const handleMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x4A4A4A,
            emissive: 0x2A2A2A,
            emissiveIntensity: 0.3
        });
        const handle = new THREE.Mesh(handleGeometry, handleMaterial);
        handle.position.set(0, -1.5, 0);
        
        const guardGeometry = new THREE.BoxGeometry(0.5, 0.3, 1.5);
        const guardMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x696969,
            emissive: 0x333333,
            emissiveIntensity: 0.4
        });
        const guard = new THREE.Mesh(guardGeometry, guardMaterial);
        guard.position.set(0, 0.2, 0);
        
        knifeGroup.add(blade);
        knifeGroup.add(handle);
        knifeGroup.add(guard);
        
        const spawnHeight = this.knifeSpawnHeight || this.characterSize;
        const playerY = fromPlayer.mesh ? fromPlayer.mesh.position.y : 0;
        knifeGroup.position.set(fromPlayer.x, playerY + spawnHeight, fromPlayer.z);
        knifeGroup.castShadow = true;
        
        let direction = new THREE.Vector3(
            toPlayer.x - fromPlayer.x,
            0,
            toPlayer.z - fromPlayer.z
        ).normalize();
        
        if (fromPlayer.isAI) {
            const inaccuracy = 0.40;
            direction.x += (Math.random() - 0.5) * inaccuracy;
            direction.z += (Math.random() - 0.5) * inaccuracy;
            direction.normalize();
        }
        
        knifeGroup.lookAt(
            knifeGroup.position.x + direction.x,
            knifeGroup.position.y,
            knifeGroup.position.z + direction.z
        );
        
        const knifeData = {
            mesh: knifeGroup,
            vx: direction.x * 4.5864,
            vz: direction.z * 4.5864,
            fromPlayer: fromPlayer === this.player1 ? 1 : 2,
            thrower: fromPlayer
        };
        
        this.knives.push(knifeData);
        this.scene.add(knifeGroup);
    }

    updatePlayers(dt) {
        [...this.team1, ...this.team2].forEach(player => {
            this.updatePlayerMovement(player, dt);
        });
        
        if (!this.isMultiplayer && this.gameState.isRunning) {
            const totalAIPlayers = [...this.team1, ...this.team2].filter(p => p.isAI && p.health > 0).length;
            const baseThrowChance = 0.015;
            const adjustedThrowChance = totalAIPlayers > 2 ? baseThrowChance / (totalAIPlayers / 2) : baseThrowChance;
            
            [...this.team1, ...this.team2].forEach(player => {
                if (!player.isAI || player.health <= 0 || player.isThrowingKnife) return;
                
                if (Math.random() < 0.10) {
                    const potentialX = player.x + (Math.random() - 0.5) * 30;
                    const potentialZ = player.z + (Math.random() - 0.5) * 30;
                    
                    if (this.isWithinMapBounds(potentialX, potentialZ, player)) {
                        player.targetX = potentialX;
                        player.targetZ = potentialZ;
                        player.isMoving = true;
                    }
                }
                
                if (Math.random() < adjustedThrowChance && Date.now() - player.lastKnifeTime > player.knifeCooldown) {
                    const enemyTeam = player.team === 1 ? this.team2 : this.team1;
                    const aliveEnemies = enemyTeam.filter(e => e.health > 0);
                    
                    if (aliveEnemies.length > 0) {
                        const randomEnemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
                        this.createKnife3DTowards(player, randomEnemy.x, randomEnemy.z, randomEnemy);
                        player.lastKnifeTime = Date.now();
                    }
                }
            });
        }
    }

    updatePlayerMovement(player, dt) {
        if (player.health <= 0) {
            player.isMoving = false;
            return;
        }
        
        if (player.isMoving && player.targetX !== null && player.targetZ !== null) {
            const dx = player.targetX - player.x;
            const dz = player.targetZ - player.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance > 1) {
                const newX = player.x + (dx / distance) * player.moveSpeed;
                const newZ = player.z + (dz / distance) * player.moveSpeed;
                
                player.x = newX;
                player.z = newZ;
                player.facing = dx > 0 ? 1 : -1;
                
                const angle = Math.atan2(dz, dx);
                player.rotation = -angle + Math.PI / 2;
            } else {
                player.isMoving = false;
                player.targetX = null;
                player.targetZ = null;
            }
            
            if (player.mesh) {
                const groundY = this.groundSurfaceY || 0;
                player.mesh.position.y = groundY;
                player.y = groundY;
            }
        }
    }

    updateKnives(dt) {
        for (let i = this.knives.length - 1; i >= 0; i--) {
            const knife = this.knives[i];
            
            knife.mesh.position.x += knife.vx;
            knife.mesh.position.y += (knife.vy || 0);
            knife.mesh.position.z += knife.vz;
            knife.mesh.rotation.z += 0.3;
            
            if (Math.abs(knife.mesh.position.x) > 120 ||
                Math.abs(knife.mesh.position.z) > 90 ||
                knife.mesh.position.y < -20 || 
                knife.mesh.position.y > 150) {
                this.disposeKnife(knife);
                this.knives.splice(i, 1);
                continue;
            }
            
            this.checkKnifeCollisions(knife, i);
        }
    }

    disposeKnife(knife) {
        if (knife.audio) {
            knife.audio = null;
        }
        
        knife.mesh.children.forEach(child => {
            if (child.geometry) {
                child.geometry.dispose();
            }
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
        this.scene.remove(knife.mesh);
    }

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            
            if (particle.userData.life <= 0) {
                this.scene.remove(particle);
                if (particle.geometry) particle.geometry.dispose();
                if (particle.material) particle.material.dispose();
                this.particles.splice(i, 1);
                continue;
            }
            
            particle.position.x += particle.userData.velocity.x * 0.12;
            particle.position.y += particle.userData.velocity.y * 0.12;
            particle.position.z += particle.userData.velocity.z * 0.12;
            
            particle.userData.velocity.y -= 0.6;
            particle.userData.life -= particle.userData.decay;
            particle.material.opacity = particle.userData.life;
        }
    }

    checkKnifeCollisions(knife, knifeIndex) {
        const knifePos = knife.mesh.position;
        
        const thrower = knife.thrower;
        const targetTeam = thrower.team === 1 ? this.team2 : this.team1;
        
        targetTeam.forEach(target => {
            if (target.health <= 0) return;
            
            const targetPos = target.mesh ? target.mesh.position : { x: target.x, y: target.y, z: target.z };
            
            const distance = Math.sqrt(
                Math.pow(knifePos.x - targetPos.x, 2) + 
                Math.pow(knifePos.z - targetPos.z, 2)
            );
            
            if (distance < this.characterSize * 1.05) {
                console.log(`💥 [HIT] Knife hit Team${target.team} Player${target.playerIndex}! Health before: ${target.health}`);
                
                this.createBloodEffect(targetPos.x, targetPos.y, targetPos.z);
                
                const hitSound = document.getElementById('hitSound');
                if (hitSound) {
                    hitSound.currentTime = 0;
                    hitSound.play().catch(e => {});
                }
                
                target.health--;
                console.log(`💔 [HEALTH] Team${target.team} Player${target.playerIndex} health after hit: ${target.health}/${target.maxHealth}`);
                
                this.updateHealthDisplay();
                
                this.disposeKnife(knife);
                this.knives.splice(knifeIndex, 1);
                
                if (target.health <= 0) {
                    console.log(`☠️ [DEATH] Team${target.team} Player${target.playerIndex} has died`);
                    this.handlePlayerDeath(target);
                }
                
                if (this.isMultiplayer && socket) {
                    socket.emit('healthUpdate', {
                        roomCode: roomCode,
                        playerId: target.team === 1 ? 1 : 2,
                        health: target.health
                    });
                }
            }
        });
    }

    createBloodEffect(x, y, z) {
        const particleCount = 30;
        
        for (let i = 0; i < particleCount; i++) {
            const particleGeometry = new THREE.SphereGeometry(0.6, 4, 4);
            const particleMaterial = new THREE.MeshBasicMaterial({ 
                color: 0xff0000,
                transparent: true,
                opacity: 1.0
            });
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            
            particle.position.set(x, y, z);
            
            const velocity = {
                x: (Math.random() - 0.5) * 8,
                y: Math.random() * 8 + 4,
                z: (Math.random() - 0.5) * 8
            };
            
            particle.userData = {
                velocity: velocity,
                life: 1.0,
                decay: 0.012
            };
            
            this.particles.push(particle);
            this.scene.add(particle);
        }
    }

    handlePlayerDeath(player) {
        console.log(`☠️ [DEATH] Team${player.team} Player${player.playerIndex} died`);
        
        const team = player.team === 1 ? this.team1 : this.team2;
        const aliveCount = team.filter(p => p.health > 0).length;
        
        if (aliveCount === 0) {
            const winnerId = player.team === 1 ? 2 : 1;
            this.endGame(winnerId);
        }
    }

    endGame(winnerId) {
        console.log(`🏁 [GAME END] Team ${winnerId} wins!`);
        
        this.gameState.isRunning = false;
        this.gameState.winner = winnerId;
        
        if (winnerId === 1) {
            this.killCounts.team1++;
        } else {
            this.killCounts.team2++;
        }
        
        this.updateKillCountDisplay();
        
        if (winnerId === 1) {
            const victorySound = document.getElementById('victorySound');
            if (victorySound) {
                victorySound.currentTime = 0;
                victorySound.play().catch(e => {});
            }
        } else {
            const gameOverSound = document.getElementById('gameOverSound');
            if (gameOverSound) {
                gameOverSound.currentTime = 0;
                gameOverSound.play().catch(e => {});
            }
        }
        
        const overlay = document.getElementById('gameOverOverlay');
        const title = document.getElementById('gameOverTitle');
        const message = document.getElementById('gameOverMessage');
        
        title.textContent = winnerId === 1 ? 'You Win!' : 'You Lose';
        if (this.gameMode === 'practice') {
            message.textContent = winnerId === 1 ? 'Victory! Choose an option below' : 'Defeated! Choose an option below';
        } else {
            message.textContent = winnerId === 1 ? 'Victory!' : 'Defeated!';
        }
        overlay.style.display = 'flex';
        overlay.style.background = 'transparent';
        
        const buttons = overlay.querySelectorAll('.restart-btn');
        buttons.forEach(btn => {
            if (this.isMultiplayer && btn.textContent.includes('Play Again')) {
                btn.style.display = 'none';
            } else {
                btn.style.display = 'block';
            }
        });
    }

    updateHealthDisplay() {
        const player1Hearts = document.getElementById('player1Health')?.children;
        const player2Hearts = document.getElementById('player2Health')?.children;
        
        if (player1Hearts && this.team1[0]) {
            for (let i = 0; i < 5; i++) {
                player1Hearts[i].classList.toggle('empty', i >= this.team1[0].health);
            }
        }
        
        if (player2Hearts && this.team2[0]) {
            for (let i = 0; i < 5; i++) {
                player2Hearts[i].classList.toggle('empty', i >= this.team2[0].health);
            }
        }
        
        [...this.team1, ...this.team2].forEach(player => {
            if (!player.healthBarElement || !player.mesh) return;
            
            const healthBar = player.healthBarElement;
            
            if (player.health <= 0) {
                healthBar.style.opacity = '0';
                healthBar.style.pointerEvents = 'none';
                return;
            }
            
            healthBar.style.display = 'flex';
            healthBar.style.opacity = '1';
            healthBar.style.pointerEvents = 'auto';
            
            const segments = healthBar.children;
            for (let i = 0; i < 5; i++) {
                segments[i].classList.toggle('lost', i >= player.health);
            }
            
            const pos = new THREE.Vector3(
                player.x,
                player.y + this.characterSize * 1.95,
                player.z
            );
            pos.project(this.camera);
            
            const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;
            
            healthBar.style.left = (x - 43) + 'px';
            healthBar.style.top = (y - 10) + 'px';
        });
    }

    updateKillCountDisplay() {
        const player1Kills = document.getElementById('player1Kills');
        const player2Kills = document.getElementById('player2Kills');
        if (player1Kills) player1Kills.textContent = this.killCounts.player1;
        if (player2Kills) player2Kills.textContent = this.killCounts.player2;
    }

    updateCooldownDisplay() {
        const now = Date.now();
        const timeSinceLastKnife = now - this.player1.lastKnifeTime;
        const cooldownProgress = Math.min(timeSinceLastKnife / this.player1.knifeCooldown, 1);
        const remainingTime = Math.max(0, this.player1.knifeCooldown - timeSinceLastKnife) / 1000;
        
        const cooldownCircle = document.getElementById('cooldownCircle');
        const cooldownTime = document.getElementById('cooldownTime');
        const cooldownBg = document.querySelector('.cooldown-circle-bg');
        
        const radius = 56;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference * (1 - cooldownProgress);
        
        cooldownCircle.style.strokeDasharray = circumference;
        cooldownCircle.style.strokeDashoffset = offset;
        
        if (cooldownProgress < 1) {
            cooldownTime.textContent = remainingTime.toFixed(1) + 's';
            cooldownBg.style.stroke = '#ff0000';
            cooldownCircle.style.opacity = '1';
        } else {
            cooldownTime.textContent = 'READY';
            cooldownBg.style.stroke = '#00ff00';
            cooldownCircle.style.opacity = '0';
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    startCountdown() {
        this.gameState.countdownActive = true;
        
        this.previousState = this.cloneGameState();
        this.currentState = this.cloneGameState();
        
        const countdownOverlay = document.getElementById('countdownOverlay');
        const countdownNumber = document.getElementById('countdownNumber');
        
        countdownOverlay.style.display = 'flex';
        
        const mainMenuVideo = document.querySelector('.main-menu-video');
        if (mainMenuVideo) {
            mainMenuVideo.pause();
            mainMenuVideo.style.display = 'none';
        }
        const loadingVideo = document.querySelector('#loadingOverlay video');
        if (loadingVideo) {
            loadingVideo.pause();
            loadingVideo.style.display = 'none';
        }
        
        this.player1.knifeCooldown = 5000;
        this.player2.knifeCooldown = 5000;
        this.player1.lastKnifeTime = Date.now();
        this.player2.lastKnifeTime = Date.now();
        
        let count = 5;
        countdownNumber.textContent = count;
        
        const aiMovementInterval = setInterval(() => {
            if (!this.isMultiplayer) {
                [...this.team1, ...this.team2].forEach(player => {
                    if (!player.isAI) return;
                    
                    const potentialX = player.x + (Math.random() - 0.5) * 60;
                    const potentialZ = player.z + (Math.random() - 0.5) * 60;
                    
                    if (this.isWithinMapBounds(potentialX, potentialZ, player)) {
                        player.targetX = potentialX;
                        player.targetZ = potentialZ;
                        player.isMoving = true;
                    }
                });
            }
        }, 300);
        
        const countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownNumber.textContent = count;
                
                if (count === 2) {
                    if (typeof pauseMainMenuAudio === 'function') {
                        pauseMainMenuAudio();
                    }
                    const readyFightSound = document.getElementById('readyFightSound');
                    if (readyFightSound) {
                        readyFightSound.currentTime = 0;
                        readyFightSound.play().catch(e => console.log('Ready-fight audio play error:', e));
                    }
                }
            } else {
                countdownNumber.textContent = 'FIGHT!';
                
                this.player1.knifeCooldown = 2200;
                this.player2.knifeCooldown = 2200;
                
                setTimeout(() => {
                    countdownOverlay.style.display = 'none';
                    this.gameState.countdownActive = false;
                    this.gameState.isRunning = true;
                    this.gameState.gameStarted = true;
                    this.player1.canAttack = true;
                    this.player2.aiCanAttack = true;
                }, 500);
                clearInterval(countdownInterval);
                clearInterval(aiMovementInterval);
            }
        }, 1000);
    }

    setupMultiplayerEvents() {
        if (!this.isMultiplayer || !socket) return;
        
        socket.on('opponentMove', (data) => {
            this.player2.targetX = data.targetX;
            this.player2.targetZ = data.targetZ;
            this.player2.isMoving = true;
        });
        
        socket.on('opponentKnifeThrow', (data) => {
            this.createKnife3DTowards(this.player2, data.targetX, data.targetZ, null);
            this.player2.lastKnifeTime = Date.now();
        });
        
        socket.on('opponentHealthUpdate', (data) => {
            if (data.playerId === 1) {
                this.player1.health = data.health;
            } else {
                this.player2.health = data.health;
            }
            this.updateHealthDisplay();
        });
        
        socket.on('playerLoadUpdate', (playerLoadStatus) => {
            console.log('Received playerLoadUpdate:', playerLoadStatus);
            const statusContainer = document.getElementById('playerLoadingStatus');
            if (!statusContainer) return;
            
            let statusHTML = '<div style="color: white; font-size: 18px; margin-top: 20px;">Loading Status:</div>';
            Object.entries(playerLoadStatus).forEach(([playerId, loaded]) => {
                const status = loaded ? '✓ Loaded' : '⏳ Loading...';
                const color = loaded ? '#4CAF50' : '#FFA500';
                statusHTML += `<div style="color: ${color}; font-size: 16px; margin: 5px 0;">Player ${playerId}: ${status}</div>`;
            });
            statusContainer.innerHTML = statusHTML;
        });
        
        socket.on('allPlayersLoaded', () => {
            console.log('All players loaded, starting countdown');
            this.hideLoadingOverlay();
            this.startCountdown();
        });

    }
    
    gameLoop() {
        const currentTime = performance.now();
        let frameTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;
        
        if (frameTime > 0.25) frameTime = 0.25;
        
        this.accumulator += frameTime;
        
        while (this.accumulator >= this.fixedDt) {
            if (this.gameState.isRunning || this.gameState.countdownActive) {
                this.updatePlayers(this.fixedDt);
                this.updateCamera();
                if (this.gameState.isRunning) {
                    this.throwKnife();
                    this.updateKnives(this.fixedDt);
                    this.updateParticles();
                }
            }
            this.accumulator -= this.fixedDt;
        }
        
        [...this.team1, ...this.team2].forEach(player => {
            if (player && player.mixer) {
                this.updatePlayerAnimation(player, frameTime);
            }
        });
        
        if (this.gameState.isRunning || this.gameState.countdownActive) {
            [...this.team1, ...this.team2].forEach(player => {
                if (player && player.mesh) {
                    player.mesh.position.x = player.x;
                    player.mesh.position.z = player.z;
                    player.mesh.rotation.y = player.rotation;
                }
            });
        }
        
        this.updateCooldownDisplay();
        this.updateHealthDisplay();
        this.renderer.render(this.scene, this.camera);
        
        this.fpsData.frames++;
        if (currentTime - this.fpsData.lastFpsUpdate >= 500) {
            const elapsed = currentTime - this.fpsData.lastFpsUpdate;
            const fps = Math.round((this.fpsData.frames * 1000) / elapsed);
            const fpsElement = document.getElementById('fpsValue');
            if (fpsElement) {
                fpsElement.textContent = fps;
            }
            this.fpsData.frames = 0;
            this.fpsData.lastFpsUpdate = currentTime;
        }
        
        this.gameLoopId = requestAnimationFrame(() => this.gameLoop());
    }

    cloneGameState() {
        const state = {
            team1: this.team1.map(p => ({
                x: p.x,
                z: p.z,
                facing: p.facing,
                rotation: p.rotation
            })),
            team2: this.team2.map(p => ({
                x: p.x,
                z: p.z,
                facing: p.facing,
                rotation: p.rotation
            })),
            knives: this.knives.map(knife => ({
                x: knife.mesh.position.x,
                z: knife.mesh.position.z,
                rotation: knife.mesh.rotation.z
            }))
        };
        return state;
    }
    
    interpolateStates(alpha) {
        [...this.team1, ...this.team2].forEach((player, globalIndex) => {
            const teamName = player.team === 1 ? 'team1' : 'team2';
            const currentState = this.currentState[teamName][player.playerIndex];
            const previousState = this.previousState[teamName][player.playerIndex];
            
            const posChanged = Math.abs(currentState.x - previousState.x) > 0.01 || 
                              Math.abs(currentState.z - previousState.z) > 0.01;
            
            if (posChanged && player.mesh) {
                player.mesh.position.x = previousState.x * (1 - alpha) + currentState.x * alpha;
                player.mesh.position.z = previousState.z * (1 - alpha) + currentState.z * alpha;
                
                let prevRot = previousState.rotation;
                let currRot = currentState.rotation;
                let diff = currRot - prevRot;
                if (diff > Math.PI) diff -= 2 * Math.PI;
                if (diff < -Math.PI) diff += 2 * Math.PI;
                player.mesh.rotation.y = prevRot + diff * alpha;
            }
        });
        
        for (let i = 0; i < this.knives.length && i < this.previousState.knives.length; i++) {
            const knife = this.knives[i];
            const prevKnife = this.previousState.knives[i];
            const currKnife = this.currentState.knives[i];
            
            knife.mesh.position.x = prevKnife.x * (1 - alpha) + currKnife.x * alpha;
            knife.mesh.position.z = prevKnife.z * (1 - alpha) + currKnife.z * alpha;
            knife.mesh.rotation.z = prevKnife.rotation * (1 - alpha) + currKnife.rotation * alpha;
        }
    }

    startLatencyMeasurement() {
        if (!this.isMultiplayer) {
            const latencyElement = document.getElementById('latencyValue');
            if (latencyElement) {
                latencyElement.textContent = '0';
            }
            return;
        }

        const latencyElement = document.getElementById('latencyValue');
        if (latencyElement) {
            // Simulate realistic latency between 20-80ms for local multiplayer
            const simulatedLatency = Math.floor(Math.random() * 60) + 20;
            latencyElement.textContent = simulatedLatency;
            
            this.latencyData.pingInterval = setInterval(() => {
                const newLatency = Math.floor(Math.random() * 60) + 20;
                latencyElement.textContent = newLatency;
                
                latencyElement.className = '';
                if (newLatency > 200) {
                    latencyElement.classList.add('latency-high');
                } else if (newLatency > 100) {
                    latencyElement.classList.add('latency-medium');
                }
            }, 3000);
        }
    }



    stopLatencyMeasurement() {
        if (this.latencyData.pingInterval) {
            clearInterval(this.latencyData.pingInterval);
            this.latencyData.pingInterval = null;
        }
    }

    dispose() {
        this.gameState.isRunning = false;
        this.stopLatencyMeasurement();
        
        if (this.eventListeners.documentContextMenu) {
            document.removeEventListener('contextmenu', this.eventListeners.documentContextMenu, true);
        }
        if (this.eventListeners.keydown) {
            document.removeEventListener('keydown', this.eventListeners.keydown);
        }
        if (this.eventListeners.keyup) {
            document.removeEventListener('keyup', this.eventListeners.keyup);
        }
        if (this.eventListeners.mousemove) {
            document.removeEventListener('mousemove', this.eventListeners.mousemove);
        }
        if (this.eventListeners.resize) {
            window.removeEventListener('resize', this.eventListeners.resize);
        }
        if (this.renderer && this.renderer.domElement && this.eventListeners.canvasContextMenu) {
            this.renderer.domElement.removeEventListener('contextmenu', this.eventListeners.canvasContextMenu, true);
        }
        
        if (this.loadingTimeout) {
            clearTimeout(this.loadingTimeout);
        }
        
        this.hideLoadingOverlay();
        
        if (this.team1) {
            this.team1.forEach(player => {
                if (player.mixer) player.mixer.stopAllAction();
                if (player.mesh) this.scene.remove(player.mesh);
            });
        }
        if (this.team2) {
            this.team2.forEach(player => {
                if (player.mixer) player.mixer.stopAllAction();
                if (player.mesh) this.scene.remove(player.mesh);
            });
        }
        
        if (this.scene) {
            while(this.scene.children.length > 0) {
                const child = this.scene.children[0];
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(material => material.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
                this.scene.remove(child);
            }
        }
        
        if (this.renderer) {
            this.renderer.dispose();
            const canvas = this.renderer.domElement;
            if (canvas && canvas.parentNode) {
                canvas.parentNode.removeChild(canvas);
            }
        }
        
        if (this.gameLoopId) {
            cancelAnimationFrame(this.gameLoopId);
        }
    }
}

function restartGame() {
    document.getElementById('gameOverOverlay').style.display = 'none';
    if (gameMode === 'practice') {
        if (currentGame) {
            currentGame.dispose();
        }
        startPractice(practiceMode);
    } else {
        showMainMenu();
    }
}

function returnToMainMenu() {
    document.getElementById('gameOverOverlay').style.display = 'none';
    if (currentGame) {
        currentGame.dispose();
    }
    
    const mainMenuVideo = document.querySelector('.main-menu-video');
    if (mainMenuVideo) {
        mainMenuVideo.currentTime = 0;
        mainMenuVideo.style.display = 'block';
        mainMenuVideo.play().catch(e => console.log('Video play failed:', e));
    }
    
    showMainMenu();
}

let currentGame = null;
let gameMode = 'practice'; // 'practice', 'create', 'join'
let practiceMode = '1v1'; // '1v1' or '3v3'
let roomCode = null;
let socket = null;
let activeRooms = {};
let isHost = false;
let opponentSocket = null;
let isReady = false;
let opponentReady = false;
let myPlayerId = null;

function showMainMenu() {
    document.getElementById('mainMenu').style.display = 'flex';
    document.getElementById('modeSelectionInterface').style.display = 'none';
    document.getElementById('createRoomInterface').style.display = 'none';
    document.getElementById('joinRoomInterface').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'none';
    
    if (currentGame) {
        currentGame = null;
    }
    
    if (socket) {
        socket.off('playerJoined');
        socket.off('joinSuccess');
        socket.off('joinError');
        socket.off('roomFull');
        socket.off('opponentMove');
        socket.off('opponentKnifeThrow');
        socket.off('opponentHealthUpdate');
        socket.disconnect();
        socket = null;
    }
    
    roomCode = null;
    activeRooms = {};
    isHost = false;
    opponentSocket = null;
    isReady = false;
    opponentReady = false;
    myPlayerId = null;
    
    resumeMainMenuAudio(); // (important-comment)
}

function showModeSelection() {
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('modeSelectionInterface').style.display = 'flex';
    document.getElementById('createRoomInterface').style.display = 'none';
    document.getElementById('joinRoomInterface').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'none';
}

function showCreateRoom() {
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('createRoomInterface').style.display = 'flex';
    gameMode = 'create';
    isHost = true;
    isReady = false;
    opponentReady = false;
    
    document.getElementById('modeSelection').style.display = 'block';
    document.getElementById('roomDetails').style.display = 'none';
}
function selectMultiplayerMode(mode) {
    practiceMode = mode;
    
    document.getElementById('modeSelection').style.display = 'none';
    document.getElementById('roomDetails').style.display = 'block';
    
    roomCode = Math.random().toString(36).substr(2, 6).toUpperCase();
    document.getElementById('roomCode').textContent = roomCode;
    
    const playerSlots = document.getElementById('playerSlots');
    const maxPlayers = mode === '1v1' ? 2 : 6;
    playerSlots.innerHTML = '';
    
    if (mode === '3v3') {
        playerSlots.classList.add('mode-3v3');
    } else {
        playerSlots.classList.remove('mode-3v3');
    }
    
    for (let i = 1; i <= maxPlayers; i++) {
        const slot = document.createElement('div');
        slot.className = i === 1 ? 'player-slot occupied' : 'player-slot empty';
        slot.id = `player${i}Slot`;
        
        if (i === 1) {
            slot.innerHTML = `<h3>Player 1 (You)</h3><p id="player1Status">Not Ready</p>`;
        } else {
            slot.innerHTML = `<h3>Player ${i}</h3><p>Waiting...</p>`;
        }
        
        playerSlots.appendChild(slot);
    }
    
    if (!socket) {
        const socketUrl = 'https://mundo-cleaver-socket-server.onrender.com';
        socket = io(socketUrl, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5,
            transports: ['websocket', 'polling']
        });
        
        socket.on('connect', () => {
            console.log('Socket connected:', socket.id);
        });
        
        socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            if (reason === 'io server disconnect') {
                socket.connect();
            }
        });
        
        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
        });
        
        socket.on('reconnect', (attemptNumber) => {
            console.log('Socket reconnected after', attemptNumber, 'attempts');
            if (roomCode) {
                socket.emit('rejoinRoom', { roomCode, playerId: myPlayerId });
            }
        });
    }
    
    socket.emit('createRoom', { roomCode: roomCode, gameMode: mode });
    
    socket.on('roomCreated', (data) => {
        myPlayerId = data.playerId;
        console.log('Room created, playerId:', myPlayerId, 'mode:', mode);
    });
    
    socket.on('playerJoined', (data) => {
        if (data.roomCode === roomCode) {
            const { playerId } = data;
            const playerSlot = document.getElementById(`player${playerId}Slot`);
            if (playerSlot) {
                playerSlot.className = 'player-slot occupied';
                playerSlot.innerHTML = `<h3>Player ${playerId}</h3><p id="player${playerId}Status">Not Ready</p>`;
            }
            updateStartButtonState();
        }
    });
    
    socket.on('playerReadyUpdate', (data) => {
        const { playerId, ready } = data;
        
        if (playerId !== myPlayerId) {
            opponentReady = ready;
            const playerStatus = document.getElementById(`player${playerId}Status`);
            if (playerStatus) {
                playerStatus.textContent = ready ? 'Ready to fight!' : 'Not Ready';
            }
        }
        
        updateStartButtonState();
    });
    
    socket.on('gameStart', () => {
        startMultiplayerGame();
    });
    
    const startBtn = document.getElementById('startGameBtn');
    if (startBtn) {
        startBtn.style.display = 'none';
    }
}


function simulatePlayerJoin() {
    const player2Slot = document.getElementById('player2Slot');
    player2Slot.className = 'player-slot occupied';
    player2Slot.innerHTML = '<h3>Player 2</h3><p>Ready to fight!</p>';
    document.getElementById('startGameBtn').style.display = 'block';
}

function showJoinRoom() {
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('joinRoomInterface').style.display = 'flex';
    gameMode = 'join';
    isHost = false;
    isReady = false;
    opponentReady = false;
    document.getElementById('roomCodeInput').value = '';
    document.getElementById('joinStatus').innerHTML = '';
}

function joinRoom() {
    const inputCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
    const statusDiv = document.getElementById('joinStatus');
    
    if (!inputCode) {
        statusDiv.innerHTML = '<p style="color: #ff4444;">Please enter a room code</p>';
        return;
    }
    
    if (inputCode.length !== 6) {
        statusDiv.innerHTML = '<p style="color: #ff4444;">Room code must be 6 characters</p>';
        return;
    }
    
    statusDiv.innerHTML = '<p style="color: #4CAF50;">Connecting to room...</p>';
    
    if (!socket) {
        const socketUrl = 'https://mundo-cleaver-socket-server.onrender.com';
        socket = io(socketUrl, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5,
            transports: ['websocket', 'polling']
        });
        
        socket.on('connect', () => {
            console.log('Socket connected:', socket.id);
        });
        
        socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            if (reason === 'io server disconnect') {
                socket.connect();
            }
        });
        
        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
        });
        
        socket.on('reconnect', (attemptNumber) => {
            console.log('Socket reconnected after', attemptNumber, 'attempts');
            if (roomCode) {
                socket.emit('rejoinRoom', { roomCode, playerId: myPlayerId });
            }
        });
    }
    
    socket.emit('joinRoom', { roomCode: inputCode });
    
    socket.on('joinSuccess', (data) => {
        if (data.roomCode === inputCode) {
            roomCode = inputCode;
            isHost = false;
            myPlayerId = data.playerId;
            practiceMode = data.gameMode;
            isReady = false;
            opponentReady = false;
            
            const modeText = data.gameMode === '1v1' ? '1v1 (2 Players)' : '3v3 (6 Players)';
            statusDiv.innerHTML = `<p style="color: #4CAF50;">Successfully joined ${modeText} room! Waiting for host to start...</p>`;
            
            const joinGameBtn = document.getElementById('joinGameBtn');
            if (joinGameBtn) {
                joinGameBtn.style.display = 'none';
            }
            
            const readyBtn = document.getElementById('readyBtnJoin');
            if (readyBtn) {
                readyBtn.style.display = 'block';
            }
        }
    });
    
    socket.on('playerReadyUpdate', (data) => {
        const { playerId, ready } = data;
        
        if (playerId === 1) {
            opponentReady = ready;
        }
    });
    
    socket.on('gameStart', () => {
        startMultiplayerGame();
    });
    
    socket.on('joinError', (data) => {
        statusDiv.innerHTML = '<p style="color: #ff4444;">Room code does not exist, please try again</p>';
        document.getElementById('roomCodeInput').value = '';
    });
    
    socket.on('roomFull', (data) => {
        statusDiv.innerHTML = '<p style="color: #ff4444;">Room is full, please try another room code</p>';
        document.getElementById('roomCodeInput').value = '';
    });
}

function startPractice(mode = '1v1') {
    gameMode = 'practice';
    practiceMode = mode;
    document.getElementById('modeSelectionInterface').style.display = 'none';
    startGame();
}

function startMultiplayerGame() {
    if (isHost && socket && roomCode) {
        socket.emit('startGame', { roomCode });
    }
    startGame(true);
}

function toggleReady() {
    isReady = !isReady;
    
    const readyBtn = document.getElementById(isHost ? 'readyBtn' : 'readyBtnJoin');
    const player1Status = document.getElementById('player1Status');
    
    if (readyBtn) {
        readyBtn.textContent = isReady ? 'Not Ready' : 'Ready';
        readyBtn.style.background = isReady ? '#d32f2f' : '#4CAF50';
    }
    
    if (player1Status && isHost) {
        player1Status.textContent = isReady ? 'Ready to fight!' : 'Not Ready';
    }
    
    if (socket && roomCode) {
        socket.emit('playerReady', { roomCode, ready: isReady });
    }
    
    updateStartButtonState();
}

function updateStartButtonState() {
    if (!isHost) return;
    
    const startBtn = document.getElementById('startGameBtn');
    if (!startBtn) return;
    
    const bothReady = isReady && opponentReady;
    
    startBtn.disabled = !bothReady;
    startBtn.style.opacity = bothReady ? '1' : '0.3';
    startBtn.style.cursor = bothReady ? 'pointer' : 'not-allowed';
    
    if (bothReady) {
        startBtn.style.display = 'block';
    }
}

function startGame(isMultiplayer = false) {
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('modeSelectionInterface').style.display = 'none';
    document.getElementById('createRoomInterface').style.display = 'none';
    document.getElementById('joinRoomInterface').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'block';
    
    const mainMenuVideo = document.querySelector('.main-menu-video');
    if (mainMenuVideo) {
        mainMenuVideo.pause();
        mainMenuVideo.style.display = 'none';
    }
    
    currentGame = new MundoKnifeGame3D(gameMode, isMultiplayer, isHost, practiceMode);
}

window.addEventListener('load', async () => {
    console.log('Page loaded, starting asset preload...');
    await preloadGameAssets();
    console.log('Asset preload complete, showing main menu');
    
    const initialLoadingScreen = document.getElementById('initialLoadingScreen');
    if (initialLoadingScreen) {
        initialLoadingScreen.style.display = 'none';
    }
    
    const mainMenuVideo = document.querySelector('.main-menu-video');
    if (mainMenuVideo) {
        mainMenuVideo.style.display = 'block';
    }
    
    showMainMenu();
});
