import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Scene setup
const scene = new THREE.Scene();

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

// WebGL renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x87CEEB); // Sky blue background
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Ground plane
const geometry = new THREE.PlaneGeometry(1000, 1000);
const material = new THREE.MeshStandardMaterial({ 
    color: 0x228B22, 
    side: THREE.DoubleSide,
    roughness: 0.8
});
const plane = new THREE.Mesh(geometry, material);
plane.rotation.x = -Math.PI / 2;
plane.receiveShadow = true;
scene.add(plane);

// Boundary values
const BOUNDARY = {
    minX: -500, // Left edge 
    maxX: 500,  // Right edge
    minZ: -500, // Front edge
    maxZ: 500   // Back edge 
};

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
scene.add(directionalLight);

// Car object and properties
let car = null;
const carSpeed = 0.03;
const rotationSpeed = 0.03;
const carObject = new THREE.Object3D();
carObject.position.set(0, 0, 0);
carObject.rotation.y = Math.PI; 
scene.add(carObject);

// Physics properties for drifting and collision
const physics = {
    velocity: new THREE.Vector3(0, 0, 0),
    direction: new THREE.Vector3(0, 0, -1),
    isDrifting: false,
    driftFactor: 0.8,    // How much the car slides (higher = more sliding)
    driftDecay: 0.98,    // How quickly drift effect fades (lower = faster fade)
    traction: 0.95,      // Normal traction when not drifting
    tireSmokeTimer: 0,
    collisionRebound: 0.5, // How much the car bounces off boundaries
    carRadius: 1.5       // Approximate car radius for collision detection
};

// Load the car model
const loader = new GLTFLoader();
loader.load('/models/2018_dodge_challenger_srt_demon.glb', function (gltf) {
    car = gltf.scene;
    car.scale.set(100, 100, 100);
    car.position.set(0, 0, 0);
    carObject.add(car);
    car.rotation.y = Math.PI;
    console.log("Car model loaded successfully");
});

// Boundary indicators
function createBoundaryMarkers() {
    const markerGeometry = new THREE.BoxGeometry(10, 2, 10);
    const markerMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    
    // Markers at corners and sides
    const cornerPositions = [
        [BOUNDARY.minX, BOUNDARY.minZ], // Bottom left
        [BOUNDARY.minX, BOUNDARY.maxZ], // Top left
        [BOUNDARY.maxX, BOUNDARY.minZ], // Bottom right
        [BOUNDARY.maxX, BOUNDARY.maxZ]  // Top right
    ];
    
    cornerPositions.forEach(pos => {
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.set(pos[0], 1, pos[1]);
        scene.add(marker);
    });
}

// Create boundary markers
createBoundaryMarkers();

// Tire smoke particles
const smokeParticles = [];
const MAX_PARTICLES = 100;

// Create a tire smoke particle
function createSmokeParticle() {
    const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 8),
        new THREE.MeshBasicMaterial({ 
            color: 0xdddddd, 
            transparent: true, 
            opacity: 0.7 
        })
    );
    
    // Randomly position behind the car wheels
    const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,  // Random X offset
        0.1,                         // Just above ground
        (Math.random() - 0.5) * 0.3   // Random Z offset
    );
    
    // Transform the offset to car's local space
    offset.applyQuaternion(carObject.quaternion);
    
    particle.position.copy(carObject.position).add(offset);
    particle.userData = {
        lifetime: 1.0,
        decay: 0.02 + Math.random() * 0.03
    };
    
    scene.add(particle);
    smokeParticles.push(particle);
    
    // Limit the number of particles
    if (smokeParticles.length > MAX_PARTICLES) {
        const oldParticle = smokeParticles.shift();
        scene.remove(oldParticle);
    }
}

// Update smoke particles
function updateSmokeParticles() {
    for (let i = smokeParticles.length - 1; i >= 0; i--) {
        const particle = smokeParticles[i];
        
        // Fade out
        particle.userData.lifetime -= particle.userData.decay;
        particle.material.opacity = particle.userData.lifetime * 0.7;
        
        // Expand
        particle.scale.addScalar(0.03);
        
        // Remove if faded out
        if (particle.userData.lifetime <= 0) {
            scene.remove(particle);
            smokeParticles.splice(i, 1);
        }
    }
}

// AudioListener and add it to the camera
const listener = new THREE.AudioListener();
camera.add(listener);

// Create global audio sources
const engineSound = new THREE.Audio(listener);
const driftSound = new THREE.Audio(listener);
const collisionSound = new THREE.Audio(listener);

// Preload collision sound
const audioLoader = new THREE.AudioLoader();
audioLoader.load('sounds/car_impact.mp3', function(buffer) {
    collisionSound.setBuffer(buffer);
    collisionSound.setVolume(0.4);
});

// Movement state
const movement = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    drift: false
};

// Camera control variables
const cameraControl = {
    isRightMouseDown: false,
    mouseX: 0,
    mouseY: 0,
    cameraAngle: 0,
    cameraDistance: 5,
    cameraHeight: 3
};

// Event listeners for keyboard controls
document.addEventListener("keydown", (event) => {
    switch (event.key.toLowerCase()) {
        case "w":
            movement.forward = true;
            
            // Hellcat sound
            if (!engineSound.isPlaying) {
                const audioLoader = new THREE.AudioLoader();
                audioLoader.load('sounds/hellcat_whine.mp3', function(buffer) {
                    engineSound.setBuffer(buffer);
                    engineSound.setLoop(true);
                    engineSound.setVolume(0.2);
                    engineSound.play();
                });
            }
            break;
        case "s":
            movement.backward = true;
            break;
        case "a":
            movement.left = true;
            break;
        case "d":
            movement.right = true;
            break;
        case " ": // For drifting
            movement.drift = true;
            physics.isDrifting = true;
            
            // Drift sound
            if (!driftSound.isPlaying) {
                const audioLoader = new THREE.AudioLoader();
                audioLoader.load('sounds/tire_squeal.mp3', function(buffer) {
                    driftSound.setBuffer(buffer);
                    driftSound.setLoop(true);
                    driftSound.setVolume(0.3);
                    driftSound.play();
                });
            }
            break;
    }
});

document.addEventListener("keyup", (event) => {
    switch (event.key.toLowerCase()) {
        case "w":
            movement.forward = false;
            engineSound.stop();
            break;
        case "s":
            movement.backward = false;
            break;
        case "a":
            movement.left = false;
            break;
        case "d":
            movement.right = false;
            break;
        case " ": 
            movement.drift = false;
            physics.isDrifting = false;
            driftSound.stop();
            break;
    }
});

document.addEventListener("mousedown", (event) => {
    if (event.button === 2) { 
        cameraControl.isRightMouseDown = true;
        cameraControl.mouseX = event.clientX;
        cameraControl.mouseY = event.clientY;
        event.preventDefault();
    }
});

document.addEventListener("mouseup", (event) => {
    if (event.button === 2) {
        cameraControl.isRightMouseDown = false;
    }
});

document.addEventListener("mousemove", (event) => {
    if (cameraControl.isRightMouseDown) {
        const deltaX = event.clientX - cameraControl.mouseX;
        const deltaY = event.clientY - cameraControl.mouseY;
        cameraControl.cameraAngle += deltaX * 0.01;
        cameraControl.cameraHeight = Math.max(1, Math.min(10, cameraControl.cameraHeight - deltaY * 0.05));
        cameraControl.mouseX = event.clientX;
        cameraControl.mouseY = event.clientY;
    }
});

document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

camera.position.set(0, 5, 10);
camera.lookAt(carObject.position);

function animate() {
    requestAnimationFrame(animate);
    physics.direction.set(0, 0, -1).applyQuaternion(carObject.quaternion);

    if (movement.forward) {

        if (physics.isDrifting) {

            const currentDir = physics.velocity.clone().normalize();
            const blendedDir = new THREE.Vector3()
                .addScaledVector(currentDir, physics.driftFactor)
                .addScaledVector(physics.direction, 1 - physics.driftFactor)
                .normalize();
            
      
            physics.velocity.addScaledVector(blendedDir, carSpeed);
        } else {
      
            physics.velocity.addScaledVector(physics.direction, carSpeed);
        }
    }
    
    if (movement.backward) {
        physics.velocity.addScaledVector(physics.direction, -carSpeed);
        engineSound.stop();
    }
    
    // Apply rotation
    if (movement.left) {
        carObject.rotation.y += physics.isDrifting ? rotationSpeed * 1.5 : rotationSpeed;
    }
    if (movement.right) {
        carObject.rotation.y -= physics.isDrifting ? rotationSpeed * 1.5 : rotationSpeed;
    }
    
    // Apply physics
    // Traction based on drift state
    const tractionFactor = physics.isDrifting ? physics.driftDecay : physics.traction;
    physics.velocity.multiplyScalar(tractionFactor);
    
    // Collision detection before actually moving the car
    // Check if the car would go outside the plane boundaries
    const nextPosition = carObject.position.clone().add(physics.velocity);
    let collision = false;
    
    // Check X boundaries
    if (nextPosition.x < BOUNDARY.minX + physics.carRadius) {
        // Hit left boundary
        physics.velocity.x = -physics.velocity.x * physics.collisionRebound;
        carObject.position.x = BOUNDARY.minX + physics.carRadius;
        collision = true;
    } 
    else if (nextPosition.x > BOUNDARY.maxX - physics.carRadius) {
        // Hit right boundary
        physics.velocity.x = -physics.velocity.x * physics.collisionRebound;
        carObject.position.x = BOUNDARY.maxX - physics.carRadius;
        collision = true;
    }
    
    // Check Z boundaries
    if (nextPosition.z < BOUNDARY.minZ + physics.carRadius) {
        // Hit front boundary
        physics.velocity.z = -physics.velocity.z * physics.collisionRebound;
        carObject.position.z = BOUNDARY.minZ + physics.carRadius;
        collision = true;
    } 
    else if (nextPosition.z > BOUNDARY.maxZ - physics.carRadius) {
        // Hit back boundary
        physics.velocity.z = -physics.velocity.z * physics.collisionRebound;
        carObject.position.z = BOUNDARY.maxZ - physics.carRadius;
        collision = true;
    }
    
    // If no collision, apply velocity normally
    if (!collision) {
        carObject.position.add(physics.velocity);
    } 
    // If collision occurred, play sound effect and create particles
    else if (collision && physics.velocity.length() > 0.05) {
        // Play collision sound if available
        if (collisionSound && collisionSound.buffer && !collisionSound.isPlaying) {
            collisionSound.play();
        }
        
        // Create some impact particles
        for (let i = 0; i < 10; i++) {
            createSmokeParticle();
        }
        
        // Slow down more after impact
        physics.velocity.multiplyScalar(0.5);
    }
    
    // Generate tire smoke if drifting and moving
    if (physics.isDrifting && (movement.forward || physics.velocity.length() > 0.05)) {
        physics.tireSmokeTimer += 1;
        if (physics.tireSmokeTimer >= 2) { // Create smoke every few frames
            createSmokeParticle();
            physics.tireSmokeTimer = 0;
        }
    }
    
    // Update smoke particles
    updateSmokeParticles();
      
    // Camera handling
    if (cameraControl.isRightMouseDown) {
        const x = carObject.position.x + cameraControl.cameraDistance * Math.sin(cameraControl.cameraAngle);
        const z = carObject.position.z + cameraControl.cameraDistance * Math.cos(cameraControl.cameraAngle);
        camera.position.set(x, cameraControl.cameraHeight, z);
        camera.lookAt(carObject.position);
    } else {
        const behindCar = new THREE.Vector3(0, 0, 1).applyQuaternion(carObject.quaternion);
        
        const cameraIdealPosition = carObject.position.clone()
            .add(behindCar.multiplyScalar(5))
            .add(new THREE.Vector3(0, 3, 0));
        
        camera.position.lerp(cameraIdealPosition, 0.1);
        
        const lookAtPoint = carObject.position.clone().add(new THREE.Vector3(0, 1, 0));
        camera.lookAt(lookAtPoint);
    }
    
    renderer.render(scene, camera);
}

animate();