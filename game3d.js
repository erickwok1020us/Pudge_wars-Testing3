const CDN_BASE_URL = 'https://pub-39b7799330674adc85f6866b080077c2.r2.dev';

class MundoKnifeGame3D {
    constructor(mode = 'practice', isMultiplayer = false, isHostPlayer = false) {
        this.gameMode = mode;
        this.isMultiplayer = isMultiplayer;
        this.isHost = isHostPlayer;
        this.lastTime = performance.now();
        this.accumulator = 0.0;
        this.fixedDt = this.getPlatformAdjustedTimestep();
        this.currentState = null;
        this.previousState = null;
        
        this.loadingProgress = {
            total: 5,
            loaded: 0,
            currentAsset: ''
        };
        
        this.showLoadingOverlay();
        this.setupThreeJS();
        
        this.loadCharacterAnimations().then(() => {
            this.initializeGame();
            this.setupCamera();
            this.setupEventListeners();
            this.setupMultiplayerEvents();
            this.hideLoadingOverlay();
            this.gameLoop();
        }).catch(error => {
            console.error('Failed to load character animations:', error);
            this.hideLoadingOverlay();
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
    }

    hideLoadingOverlay() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    updateLoadingProgress(assetName) {
        this.loadingProgress.loaded++;
        this.loadingProgress.currentAsset = assetName;
        
        const percentage = Math.round((this.loadingProgress.loaded / this.loadingProgress.total) * 100);
        
        const loadingBar = document.getElementById('loadingBar');
        const loadingText = document.getElementById('loadingText');
        const loadingAsset = document.getElementById('loadingAsset');
        
        if (loadingBar) loadingBar.style.width = percentage + '%';
        if (loadingText) loadingText.textContent = `Loading assets... ${percentage}%`;
        if (loadingAsset) loadingAsset.textContent = assetName;
    }

    async loadCharacterAnimations() {
        const loader = new THREE.FBXLoader();
        
        const animationFiles = {
            idle: `${CDN_BASE_URL}/Animation_Idle_frame_rate_60.fbx`,
            run: `${CDN_BASE_URL}/Animation_RunFast_frame_rate_60.fbx`,
            skill: `${CDN_BASE_URL}/Animation_Skill_03_frame_rate_60.fbx`,
            death: `${CDN_BASE_URL}/Animation_Dead_frame_rate_60.fbx`
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
                            'skill': 'Skill Animation',
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
        this.container.appendChild(this.renderer.domElement);
        
        this.setupLighting();
        this.setupTerrain();
        
        window.addEventListener('resize', () => this.onWindowResize());
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
            
            const invisibleGroundGeometry = new THREE.PlaneGeometry(400, 400);
            const invisibleGroundMaterial = new THREE.MeshBasicMaterial({ 
                color: 0x000000, 
                transparent: true, 
                opacity: 0 
            });
            this.invisibleGround = new THREE.Mesh(invisibleGroundGeometry, invisibleGroundMaterial);
            this.invisibleGround.rotation.x = -Math.PI / 2;
            this.invisibleGround.position.y = 0.05;
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
        
        const invisibleGroundGeometry = new THREE.PlaneGeometry(200, 150);
        const invisibleGroundMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x000000, 
            transparent: true, 
            opacity: 0 
        });
        this.invisibleGround = new THREE.Mesh(invisibleGroundGeometry, invisibleGroundMaterial);
        this.invisibleGround.rotation.x = -Math.PI / 2;
        this.invisibleGround.position.y = 0.05;
        this.scene.add(this.invisibleGround);
    }

    generateRandomSpawnPositions() {
        const riverZone = { xMin: -10, xMax: 10 };
        
        const zBounds = { zMin: -40, zMax: 40 };
        
        const player1Bounds = { xMin: -50, xMax: -20 };
        const player2Bounds = { xMin: 20, xMax: 50 };
        
        const player1Pos = {
            x: Math.random() * (player1Bounds.xMax - player1Bounds.xMin) + player1Bounds.xMin,
            z: Math.random() * (zBounds.zMax - zBounds.zMin) + zBounds.zMin
        };
        
        const player2Pos = {
            x: Math.random() * (player2Bounds.xMax - player2Bounds.xMin) + player2Bounds.xMin,
            z: Math.random() * (zBounds.zMax - zBounds.zMin) + zBounds.zMin
        };
        
        const player1Facing = 1;
        const player2Facing = -1;
        
        return {
            player1: { x: player1Pos.x, z: player1Pos.z, facing: player1Facing },
            player2: { x: player2Pos.x, z: player2Pos.z, facing: player2Facing }
        };
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
        
        const spawnPositions = this.generateRandomSpawnPositions();
        
        this.player1 = {
            x: spawnPositions.player1.x,
            y: 0,
            z: spawnPositions.player1.z,
            health: 5,
            maxHealth: 5,
            color: 0xff6b6b,
            facing: spawnPositions.player1.facing,
            isMoving: false,
            targetX: null,
            targetZ: null,
            moveSpeed: 0.39,
            lastKnifeTime: 0,
            knifeCooldown: 2200,
            mesh: null,
            isThrowingKnife: false,
            mixer: null,
            animations: {},
            currentAnimation: null,
            animationState: 'idle'
        };

        this.player2 = {
            x: spawnPositions.player2.x,
            y: 0,
            z: spawnPositions.player2.z,
            health: 5,
            maxHealth: 5,
            color: 0x4ecdc4,
            facing: spawnPositions.player2.facing,
            isMoving: false,
            targetX: null,
            targetZ: null,
            moveSpeed: 0.39,
            lastKnifeTime: 0,
            knifeCooldown: this.isMultiplayer ? 2200 : 300000,
            mesh: null,
            aiStartDelay: 0,
            aiCanAttack: !this.isMultiplayer,
            isThrowingKnife: false,
            mixer: null,
            animations: {},
            currentAnimation: null,
            animationState: 'idle'
        };

        this.knives = [];
        
        this.killCounts = {
            player1: 0,
            player2: 0
        };

        this.keys = {};
        
        this.mouse = {
            x: 0,
            y: 0
        };

        this.raycaster = new THREE.Raycaster();
        this.mouseVector = new THREE.Vector2();
        this.mouseWorldX = 0;
        this.mouseWorldZ = 0;

        this.createPlayer3D(this.player1);
        this.createPlayer3D(this.player2);
        
        this.setupCamera();
        this.updateHealthDisplay();
        this.startCountdown();
        this.startLatencyMeasurement();
    }

    createPlayer3D(player) {
        player.mesh = THREE.SkeletonUtils.clone(this.characterModel);
        
        const scaleValue = 0.0805;
        player.mesh.scale.set(scaleValue, scaleValue, scaleValue);
        
        const groundY = this.groundSurfaceY || 0;
        player.mesh.position.set(player.x, groundY, player.z);
        player.y = groundY;
        player.mesh.castShadow = false;
        
        player.mesh.traverse((child) => {
            if (child.isMesh) {
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach((mat) => {
                            mat.roughness = 0.9;
                            mat.metalness = 0.1;
                            mat.needsUpdate = true;
                        });
                    } else {
                        child.material.roughness = 0.9;
                        child.material.metalness = 0.1;
                        child.material.needsUpdate = true;
                    }
                }
            }
        });
        
        player.mixer = new THREE.AnimationMixer(player.mesh);
        player.currentAnimation = null;
        player.animationState = 'idle';
        
        player.animations = {};
        player.animations.idle = player.mixer.clipAction(this.animations.idle);
        player.animations.run = player.mixer.clipAction(this.animations.run);
        player.animations.skill = player.mixer.clipAction(this.animations.skill);
        player.animations.death = player.mixer.clipAction(this.animations.death);
        
        player.animations.idle.loop = THREE.LoopRepeat;
        player.animations.run.loop = THREE.LoopRepeat;
        player.animations.skill.loop = THREE.LoopOnce;
        player.animations.death.loop = THREE.LoopOnce;
        
        player.animations.idle.play();
        player.currentAnimation = player.animations.idle;
        
        this.scene.add(player.mesh);
        
        player.healthSprite = this.createHealthDisplay(player);
        player.mesh.add(player.healthSprite);
    }

    createHealthDisplay(player) {
        const canvas = document.createElement('canvas');
        canvas.width = 384;
        canvas.height = 192;
        const context = canvas.getContext('2d');
        
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        context.fillStyle = '#ff4444';
        context.font = '72px Arial';
        context.textAlign = 'center';
        context.fillText('❤️', 160, 120);
        
        context.fillStyle = '#ffffff';
        context.font = 'bold 86px Arial';
        context.fillText(player.health.toString(), 260, 120);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ 
            map: texture,
            depthTest: false,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        
        sprite.scale.set(300, 150, 1);
        sprite.position.set(0, 180, 0);
        sprite.renderOrder = 999;
        
        return sprite;
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
                newAnimation.reset().fadeIn(0.2).play();
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
        document.addEventListener('keydown', (e) => {
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
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.handlePlayerMovement(e);
        });

        document.addEventListener('mousemove', (e) => {
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
        });
    }

    handlePlayerMovement(event) {
        const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
        const mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
        
        this.mouse.x = mouseX;
        this.mouse.y = mouseY;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.invisibleGround);
        
        if (intersects.length > 0) {
            const point = intersects[0].point;
            
            if (Math.abs(point.x) < 10) {
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
        const now = Date.now();
        
        if (now - this.player1.lastKnifeTime >= this.player1.knifeCooldown) {
            const qSkillSound = document.getElementById('qSkillSound');
            if (qSkillSound) {
                qSkillSound.currentTime = 0;
                qSkillSound.play().catch(e => {});
            }
            
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObject(this.invisibleGround);
            
            if (intersects.length > 0) {
                this.mouseWorldX = intersects[0].point.x;
                this.mouseWorldZ = intersects[0].point.z;
            }
            
            if (this.mouseWorldX === 0 && this.mouseWorldZ === 0) {
                const defaultTargetX = this.player1.x + (this.player1.facing * 20);
                const defaultTargetZ = this.player1.z;
                this.createKnife3DTowards(this.player1, defaultTargetX, defaultTargetZ);
            } else {
                this.createKnife3DTowards(this.player1, this.mouseWorldX, this.mouseWorldZ);
            }
            
            this.player1.isThrowingKnife = true;
            this.player1.isMoving = false;
            this.player1.targetX = null;
            this.player1.targetZ = null;
            this.player1.lastKnifeTime = now;
            
            setTimeout(() => {
                this.player1.isThrowingKnife = false;
            }, 2500);
            
            if (this.isMultiplayer && socket) {
                const targetX = (this.mouseWorldX === 0 && this.mouseWorldZ === 0) ? 
                    this.player1.x + (this.player1.facing * 20) : this.mouseWorldX;
                const targetZ = (this.mouseWorldX === 0 && this.mouseWorldZ === 0) ? 
                    this.player1.z : this.mouseWorldZ;
                    
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
        
        if (!this.isMultiplayer && this.player2.aiCanAttack && now - this.player2.lastKnifeTime >= this.player2.knifeCooldown) {
            const qSkillSound = document.getElementById('qSkillSound');
            if (qSkillSound) {
                qSkillSound.currentTime = 0;
                qSkillSound.play().catch(e => {});
            }
            
            this.createKnife3D(this.player2, this.player1);
            
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

    createKnife3DTowards(fromPlayer, targetX, targetZ) {
        const knifeGroup = new THREE.Group();
        
        const bladeGeometry = new THREE.BoxGeometry(0.3, 6, 1.2);
        const bladeMaterial = new THREE.MeshLambertMaterial({ color: 0xC0C0C0 });
        const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
        blade.position.set(0, 2, 0);
        
        const handleGeometry = new THREE.BoxGeometry(0.4, 2.5, 0.8);
        const handleMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
        const handle = new THREE.Mesh(handleGeometry, handleMaterial);
        handle.position.set(0, -1.5, 0);
        
        const guardGeometry = new THREE.BoxGeometry(0.5, 0.3, 1.5);
        const guardMaterial = new THREE.MeshLambertMaterial({ color: 0x696969 });
        const guard = new THREE.Mesh(guardGeometry, guardMaterial);
        guard.position.set(0, 0.2, 0);
        
        knifeGroup.add(blade);
        knifeGroup.add(handle);
        knifeGroup.add(guard);
        
        knifeGroup.position.set(fromPlayer.x, fromPlayer.y + this.characterSize, fromPlayer.z);
        knifeGroup.castShadow = true;
        
        const direction = new THREE.Vector3(
            targetX - fromPlayer.x,
            0,
            targetZ - fromPlayer.z
        ).normalize();
        
        knifeGroup.lookAt(new THREE.Vector3(targetX, fromPlayer.y + this.characterSize, targetZ));
        
        const knifeData = {
            mesh: knifeGroup,
            vx: direction.x * 4.5864,
            vz: direction.z * 4.5864,
            fromPlayer: fromPlayer === this.player1 ? 1 : 2
        };
        
        this.knives.push(knifeData);
        this.scene.add(knifeGroup);
    }

    createKnife3D(fromPlayer, toPlayer) {
        const knifeGroup = new THREE.Group();
        
        const bladeGeometry = new THREE.BoxGeometry(0.3, 6, 1.2);
        const bladeMaterial = new THREE.MeshLambertMaterial({ color: 0xC0C0C0 });
        const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
        blade.position.set(0, 2, 0);
        
        const handleGeometry = new THREE.BoxGeometry(0.4, 2.5, 0.8);
        const handleMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
        const handle = new THREE.Mesh(handleGeometry, handleMaterial);
        handle.position.set(0, -1.5, 0);
        
        const guardGeometry = new THREE.BoxGeometry(0.5, 0.3, 1.5);
        const guardMaterial = new THREE.MeshLambertMaterial({ color: 0x696969 });
        const guard = new THREE.Mesh(guardGeometry, guardMaterial);
        guard.position.set(0, 0.2, 0);
        
        knifeGroup.add(blade);
        knifeGroup.add(handle);
        knifeGroup.add(guard);
        
        knifeGroup.position.set(fromPlayer.x, fromPlayer.y + this.characterSize, fromPlayer.z);
        knifeGroup.castShadow = true;
        
        let direction = new THREE.Vector3(
            toPlayer.x - fromPlayer.x,
            0,
            toPlayer.z - fromPlayer.z
        ).normalize();
        
        if (fromPlayer === this.player2) {
            const inaccuracy = 0.26;
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
            fromPlayer: fromPlayer === this.player1 ? 1 : 2
        };
        
        this.knives.push(knifeData);
        this.scene.add(knifeGroup);
    }

    updatePlayers(dt) {
        this.updatePlayerMovement(this.player1, dt);
        this.updatePlayerMovement(this.player2, dt);
        
        if (!this.isMultiplayer && this.player2.health > 0 && this.gameState.isRunning && !this.player2.isThrowingKnife && Math.random() < 0.06) {
            const potentialX = this.player2.x + (Math.random() - 0.5) * 25;
            const potentialZ = this.player2.z + (Math.random() - 0.5) * 25;
            
            this.player2.targetX = Math.max(25, Math.min(60, potentialX));
            this.player2.targetZ = Math.max(-60, Math.min(60, potentialZ));
            this.player2.isMoving = true;
        }
    }

    updatePlayerMovement(player, dt) {
        if (player.isMoving && player.targetX !== null && player.targetZ !== null) {
            const dx = player.targetX - player.x;
            const dz = player.targetZ - player.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance > 1) {
                const newX = player.x + (dx / distance) * player.moveSpeed;
                const newZ = player.z + (dz / distance) * player.moveSpeed;
                
                const riverZone = { xMin: -10, xMax: 10 };
                const mapBounds = { xMin: -70, xMax: 70, zMin: -70, zMax: 70 };
                let canMove = true;
                
                if (player.x < riverZone.xMin && newX > riverZone.xMin) {
                    canMove = false;
                } else if (player.x > riverZone.xMax && newX < riverZone.xMax) {
                    canMove = false;
                }
                
                if (newX < mapBounds.xMin || newX > mapBounds.xMax || 
                    newZ < mapBounds.zMin || newZ > mapBounds.zMax) {
                    canMove = false;
                }
                
                if (canMove) {
                    player.x = newX;
                    player.z = newZ;
                    player.facing = dx > 0 ? 1 : -1;
                    
                    const angle = Math.atan2(dz, dx);
                    player.mesh.rotation.y = -angle + Math.PI / 2;
                } else {
                    player.isMoving = false;
                    player.targetX = null;
                    player.targetZ = null;
                }
            } else {
                player.isMoving = false;
                player.targetX = null;
                player.targetZ = null;
            }
            
            if (player.mesh) {
                const groundY = this.groundSurfaceY || 0;
                player.mesh.position.set(player.x, groundY, player.z);
            }
        }
    }

    updateKnives(dt) {
        for (let i = this.knives.length - 1; i >= 0; i--) {
            const knife = this.knives[i];
            
            knife.mesh.position.x += knife.vx;
            knife.mesh.position.z += knife.vz;
            knife.mesh.rotation.z += 0.3;
            
            if (Math.abs(knife.mesh.position.x) > 120 || Math.abs(knife.mesh.position.z) > 90) {
                this.disposeKnife(knife);
                this.knives.splice(i, 1);
                continue;
            }
            
            this.checkKnifeCollisions(knife, i);
        }
    }

    disposeKnife(knife) {
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
        
        const targets = knife.fromPlayer === 1 ? [this.player2] : [this.player1];
        
        targets.forEach(target => {
            if (target.health <= 0) return;
            
            const targetPos = target.mesh ? target.mesh.position : { x: target.x, y: target.y, z: target.z };
            
            const distance = Math.sqrt(
                Math.pow(knifePos.x - targetPos.x, 2) + 
                Math.pow(knifePos.z - targetPos.z, 2)
            );
            
            if (distance < this.characterSize * 0.7) {
                this.createBloodEffect(targetPos.x, targetPos.y, targetPos.z);
                
                target.health--;
                this.updateHealthDisplay();
                
                this.disposeKnife(knife);
                this.knives.splice(knifeIndex, 1);
                
                if (target.health <= 0) {
                    this.handlePlayerDeath(target === this.player1 ? 1 : 2);
                }
                
                if (this.isMultiplayer && socket) {
                    socket.emit('healthUpdate', {
                        roomCode: roomCode,
                        playerId: target === this.player1 ? 1 : 2,
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

    handlePlayerDeath(deadPlayerId) {
        const winnerId = deadPlayerId === 1 ? 2 : 1;
        
        if (winnerId === 1) {
            this.killCounts.player1++;
        } else {
            this.killCounts.player2++;
        }
        
        this.updateKillCountDisplay();
        this.endGame(winnerId);
    }

    endGame(winnerId) {
        this.gameState.isRunning = false;
        this.gameState.winner = winnerId;
        
        const overlay = document.getElementById('gameOverOverlay');
        const title = document.getElementById('gameOverTitle');
        const message = document.getElementById('gameOverMessage');
        
        title.textContent = `Player ${winnerId} Wins!`;
        if (this.gameMode === 'practice') {
            message.textContent = `Player ${winnerId} is victorious! Press "R" to retry`;
        } else {
            message.textContent = `Player ${winnerId} is victorious!`;
        }
        overlay.style.display = 'flex';
        overlay.style.background = 'rgba(0, 0, 0, 0.8)';
        
        const restartBtn = overlay.querySelector('.restart-btn');
        if (restartBtn) {
            if (this.gameMode === 'practice') {
                restartBtn.textContent = 'Play Again';
                restartBtn.style.display = 'block';
            } else {
                restartBtn.textContent = 'Back to Menu';
                restartBtn.style.display = 'block';
            }
        }
    }

    updateHealthDisplay() {
        const player1Hearts = document.getElementById('player1Health').children;
        const player2Hearts = document.getElementById('player2Health').children;
        
        for (let i = 0; i < 5; i++) {
            player1Hearts[i].classList.toggle('empty', i >= this.player1.health);
            player2Hearts[i].classList.toggle('empty', i >= this.player2.health);
        }
        
        if (this.player1.healthSprite && this.player1.healthSprite.material.map) {
            const canvas = this.player1.healthSprite.material.map.image;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#ff4444';
            ctx.font = '72px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('❤️', 160, 120);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 86px Arial';
            ctx.fillText(this.player1.health.toString(), 260, 120);
            this.player1.healthSprite.material.map.needsUpdate = true;
        }
        
        if (this.player2.healthSprite && this.player2.healthSprite.material.map) {
            const canvas = this.player2.healthSprite.material.map.image;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#ff4444';
            ctx.font = '72px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('❤️', 160, 120);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 86px Arial';
            ctx.fillText(this.player2.health.toString(), 260, 120);
            this.player2.healthSprite.material.map.needsUpdate = true;
        }
    }

    updateKillCountDisplay() {
        document.getElementById('player1Kills').textContent = this.killCounts.player1;
        document.getElementById('player2Kills').textContent = this.killCounts.player2;
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
        const countdownOverlay = document.getElementById('countdownOverlay');
        const countdownNumber = document.getElementById('countdownNumber');
        
        if (typeof stopMainMenuAudio === 'function') {
            stopMainMenuAudio();
        }
        
        countdownOverlay.style.display = 'flex';
        
        let count = 5;
        countdownNumber.textContent = count;
        
        const countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownNumber.textContent = count;
            } else {
                countdownNumber.textContent = 'FIGHT!';
                setTimeout(() => {
                    countdownOverlay.style.display = 'none';
                    this.gameState.countdownActive = false;
                    this.gameState.isRunning = true;
                    this.gameState.gameStarted = true;
                    
                    setTimeout(() => {
                        this.player2.aiCanAttack = true;
                    }, 1000);
                }, 500);
                clearInterval(countdownInterval);
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
            this.createKnife3DTowards(this.player2, data.targetX, data.targetZ);
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

    }
    
    gameLoop() {
        const currentTime = performance.now();
        let frameTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;
        
        if (frameTime > 0.25) frameTime = 0.25;
        
        this.accumulator += frameTime;
        
        while (this.accumulator >= this.fixedDt) {
            if (this.gameState.isRunning) {
                this.previousState = this.cloneGameState();
                this.updatePlayers(this.fixedDt);
                this.throwKnife();
                this.updateKnives(this.fixedDt);
                this.updateParticles();
                this.updateCamera();
                this.currentState = this.cloneGameState();
            }
            this.accumulator -= this.fixedDt;
        }
        
        if (this.player1 && this.player1.mixer) {
            this.updatePlayerAnimation(this.player1, frameTime);
        }
        if (this.player2 && this.player2.mixer) {
            this.updatePlayerAnimation(this.player2, frameTime);
        }
        
        if (this.gameState.isRunning && this.previousState && this.currentState) {
            const alpha = this.accumulator / this.fixedDt;
            this.interpolateStates(alpha);
        }
        
        this.updateCooldownDisplay();
        this.renderer.render(this.scene, this.camera);
        
        this.gameLoopId = requestAnimationFrame(() => this.gameLoop());
    }

    cloneGameState() {
        return {
            player1: {
                x: this.player1.x,
                z: this.player1.z,
                facing: this.player1.facing
            },
            player2: {
                x: this.player2.x,
                z: this.player2.z,
                facing: this.player2.facing
            },
            knives: this.knives.map(knife => ({
                x: knife.mesh.position.x,
                z: knife.mesh.position.z,
                rotation: knife.mesh.rotation.z
            }))
        };
    }
    
    interpolateStates(alpha) {
        this.player1.mesh.position.x = this.previousState.player1.x * (1 - alpha) + this.currentState.player1.x * alpha;
        this.player1.mesh.position.z = this.previousState.player1.z * (1 - alpha) + this.currentState.player1.z * alpha;
        
        this.player2.mesh.position.x = this.previousState.player2.x * (1 - alpha) + this.currentState.player2.x * alpha;
        this.player2.mesh.position.z = this.previousState.player2.z * (1 - alpha) + this.currentState.player2.z * alpha;
        
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
        
        if (this.player1 && this.player1.mixer) {
            this.player1.mixer.stopAllAction();
        }
        if (this.player2 && this.player2.mixer) {
            this.player2.mixer.stopAllAction();
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
        startPractice();
    } else {
        showMainMenu();
    }
}

let currentGame = null;
let gameMode = 'practice'; // 'practice', 'create', 'join'
let roomCode = null;
let socket = null;
let activeRooms = {};
let isHost = false;
let opponentSocket = null;

function showMainMenu() {
    document.getElementById('mainMenu').style.display = 'flex';
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
    
    activeRooms = {};
    isHost = false;
    opponentSocket = null;
}

function showCreateRoom() {
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('createRoomInterface').style.display = 'flex';
    gameMode = 'create';
    isHost = true;
    
    roomCode = Math.random().toString(36).substr(2, 6).toUpperCase();
    document.getElementById('roomCode').textContent = roomCode;
    
    activeRooms[roomCode] = {
        host: true,
        players: 1,
        hostSocket: null
    };
    
    if (!socket) {
        socket = io().startListening();
    }
    
    socket.emit('createRoom', { roomCode: roomCode });
    
    socket.on('playerJoined', (data) => {
        if (data.roomCode === roomCode) {
            const player2Slot = document.getElementById('player2Slot');
            player2Slot.className = 'player-slot occupied';
            player2Slot.innerHTML = '<h3>Player 2</h3><p>Ready to fight!</p>';
            document.getElementById('startGameBtn').style.display = 'block';
            activeRooms[roomCode].players = 2;
        }
    });
    
    const player2Slot = document.getElementById('player2Slot');
    player2Slot.className = 'player-slot empty';
    player2Slot.innerHTML = '<h3>Player 2</h3><p>Waiting for opponent...</p>';
    document.getElementById('startGameBtn').style.display = 'none';
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
        socket = io().startListening();
    }
    
    socket.emit('joinRoom', { roomCode: inputCode });
    
    socket.on('joinSuccess', (data) => {
        if (data.roomCode === inputCode) {
            roomCode = inputCode;
            isHost = false;
            statusDiv.innerHTML = '<p style="color: #4CAF50;">Successfully joined room! Starting game...</p>';
            setTimeout(() => {
                startMultiplayerGame();
            }, 1500);
        }
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

function startPractice() {
    gameMode = 'practice';
    startGame();
}

function startMultiplayerGame() {
    startGame(true);
}

function startGame(isMultiplayer = false) {
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('createRoomInterface').style.display = 'none';
    document.getElementById('joinRoomInterface').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'block';
    
    currentGame = new MundoKnifeGame3D(gameMode, isMultiplayer, isHost);
}

window.addEventListener('load', () => {
    showMainMenu();
});
