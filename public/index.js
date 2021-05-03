import * as THREE from '/build/three.module.js';
import { OrbitControls } from "/json/controls/OrbitControls.js";
import { GLTFLoader } from '/json/loaders/GLTFLoader.js';




const scene = new THREE.Scene();
scene.background = new THREE.Color('black');

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(-1, 1.6, 4.5);


const light = new THREE.AmbientLight(0xb4ddff, 0.1); // soft white light
const point_light = new THREE.PointLight(0x0f9bff, 1, 12);
point_light.position.set(0, 0, 2);
scene.add(light);
scene.add(point_light);

// const sphereSize = 1;
// const pointLightHelper = new THREE.PointLightHelper(point_light, sphereSize);
// scene.add(pointLightHelper);

const point_light2 = new THREE.PointLight(0x0356fc, 1, 12);
point_light2.position.set(0, 6, -8);
scene.add(point_light2);

const canvas = document.querySelector("#canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);

// Add mouse controls for camera.
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

const loader = new GLTFLoader();
let models = new THREE.Scene();
// load: function (url, onLoad, onProgress, onError)
loader.load('/Assets/scene.gltf',
    function (gltf) {
        console.log(gltf)
        gltf.scene.scale.set(0.02, 0.02, 0.02);//缩小为原来0.5倍
        models = gltf.scene;
        scene.add(models);
        console.log("object added")
        models.position.set(-1, 0, 0);
    },
    // undefined,
    function (xhr) {
        if (xhr.lengthComputable) {
            var percentComplete = xhr.loaded / xhr.total * 100;
            console.log(Math.round(percentComplete, 2) + '% downloaded');
        }
    },
    function (error) {
        console.log('Error when loading gltf models');
    }
);

let skyboxImage = "night";
const materialArray = createMaterialArray(skyboxImage);
const skyboxGeo = new THREE.BoxGeometry(1000, 1000, 1000);
const skybox = new THREE.Mesh(skyboxGeo, materialArray);
scene.add(skybox);


var clock = new THREE.Clock();
// import

///////////////////////////////////////////////////////////////////////////////

/////////////
// SHADERS //
/////////////

// attribute: data that may be different for each particle (such as size and color);
//      can only be used in vertex shader
// varying: used to communicate data from vertex shader to fragment shader
// uniform: data that is the same for each particle (such as texture)

function vertShader() {
    return `
    uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 modelViewMatrix;

attribute vec3 position;
attribute vec3  customColor;
attribute float customOpacity;
attribute float customSize;
attribute float customAngle;
attribute float customVisible;  // float used as boolean (0 = false, 1 = true)
varying vec4  vColor;
varying float vAngle;

void main()
{
    if ( customVisible > 0.5 )
    {
        vColor = vec4( customColor, customOpacity );} //     set color associated to vertex; use later in fragment shader.
    else{
        vColor = vec4(0.0, 0.0, 0.0, 0.0); 		//     make particle invisible.
    }							// false


    vAngle = customAngle;
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    gl_PointSize = customSize * ( 300.0 / length( mvPosition.xyz ) );     // scale particles as objects in 3D space
    gl_Position = projectionMatrix * mvPosition;
}
  `
}

function fragShader() {
    return `
    
    precision mediump float;

    uniform sampler2D texture;
    varying vec4 vColor;
    varying float vAngle;
    void main()
    {
        gl_FragColor = vColor;

        float c = cos(vAngle);
        float s = sin(vAngle);
        vec2 rotatedUV = vec2(c * (gl_PointCoord.x - 0.5) + s * (gl_PointCoord.y - 0.5) + 0.5,
            c * (gl_PointCoord.y - 0.5) - s * (gl_PointCoord.x - 0.5) + 0.5);  // rotate UV coordinates to rotate texture
        vec4 rotatedTexture = texture2D(texture, rotatedUV);
        gl_FragColor = gl_FragColor * rotatedTexture;    // sets an otherwise white particle texture to desired color
    }
    `
}


///////////////////////////////////////////////////////////////////////////////

/////////////////
// TWEEN CLASS //
/////////////////

function Tween(timeArray, valueArray) {
    this.times = timeArray || [];
    this.values = valueArray || [];
}

Tween.prototype.lerp = function (t) {
    var i = 0;
    var n = this.times.length;
    while (i < n && t > this.times[i])
        i++;
    if (i == 0) return this.values[0];
    if (i == n) return this.values[n - 1];
    var p = (t - this.times[i - 1]) / (this.times[i] - this.times[i - 1]);
    if (this.values[0] instanceof THREE.Vector3)
        return this.values[i - 1].clone().lerp(this.values[i], p);
    else // its a float
        return this.values[i - 1] + p * (this.values[i] - this.values[i - 1]);
}

///////////////////////////////////////////////////////////////////////////////

////////////////////
// PARTICLE CLASS //
////////////////////

function Particle() {
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3(); // units per second
    this.acceleration = new THREE.Vector3();

    this.angle = 0;
    this.angleVelocity = 0; // degrees per second
    this.angleAcceleration = 0; // degrees per second, per second

    this.size = 16.0;

    this.color = new THREE.Color();
    this.opacity = 1.0;

    this.age = 0;
    this.alive = 0; // use float instead of boolean for shader purposes	
}

Particle.prototype.update = function (dt) {
    this.position.add(this.velocity.clone().multiplyScalar(dt));
    this.velocity.add(this.acceleration.clone().multiplyScalar(dt));

    // convert from degrees to radians: 0.01745329251 = Math.PI/180
    this.angle += this.angleVelocity * 0.01745329251 * dt;
    this.angleVelocity += this.angleAcceleration * 0.01745329251 * dt;

    this.age += dt;
    // if the tween for a given attribute is nonempty,
    //  then use it to update the attribute's value

    if (this.sizeTween.times.length > 0)
        this.size = this.sizeTween.lerp(this.age);

    if (this.colorTween.times.length > 0) {
        var colorHSL = this.colorTween.lerp(this.age);
        this.color = new THREE.Color().setHSL(colorHSL.x, colorHSL.y, colorHSL.z);
    }

    if (this.opacityTween.times.length > 0)
        this.opacity = this.opacityTween.lerp(this.age);
}

///////////////////////////////////////////////////////////////////////////////

///////////////////////////
// PARTICLE ENGINE CLASS //
///////////////////////////

var Type = Object.freeze({ "CUBE": 1, "SPHERE": 2 });

function ParticleEngine() {
    /////////////////////////
    // PARTICLE PROPERTIES //
    /////////////////////////

    this.positionStyle = Type.CUBE;
    this.positionBase = new THREE.Vector3();
    // cube shape data
    this.positionSpread = new THREE.Vector3();
    // sphere shape data
    this.positionRadius = 0; // distance from base at which particles start

    this.velocityStyle = Type.CUBE;
    // cube movement data
    this.velocityBase = new THREE.Vector3();
    this.velocitySpread = new THREE.Vector3();
    // sphere movement data
    //   direction vector calculated using initial position
    this.speedBase = 0;
    this.speedSpread = 0;

    this.accelerationBase = new THREE.Vector3();
    this.accelerationSpread = new THREE.Vector3();

    this.angleBase = 0;
    this.angleSpread = 0;
    this.angleVelocityBase = 0;
    this.angleVelocitySpread = 0;
    this.angleAccelerationBase = 0;
    this.angleAccelerationSpread = 0;

    this.sizeBase = 0.0;
    this.sizeSpread = 0.0;
    this.sizeTween = new Tween();

    // store colors in HSL format in a THREE.Vector3 object
    // http://en.wikipedia.org/wiki/HSL_and_HSV
    this.colorBase = new THREE.Vector3(0.0, 1.0, 0.5);
    this.colorSpread = new THREE.Vector3(0.0, 0.0, 0.0);
    this.colorTween = new Tween();

    this.opacityBase = 1.0;
    this.opacitySpread = 0.0;
    this.opacityTween = new Tween();

    this.blendStyle = THREE.NormalBlending; // false;

    this.particleArray = [];
    this.particlesPerSecond = 100;
    this.particleDeathAge = 1.0;

    ////////////////////////
    // EMITTER PROPERTIES //
    ////////////////////////

    this.emitterAge = 0.0;
    this.emitterAlive = true;
    this.emitterDeathAge = 60; // time (seconds) at which to stop creating particles.

    // How many particles could be active at any time?
    this.particleCount = this.particlesPerSecond * Math.min(this.particleDeathAge, this.emitterDeathAge);

    //////////////
    // THREE.JS //
    //////////////
    this.position = [];
    this.customAngle = [];
    this.customVisible = [];
    this.customSize = [];
    this.customColor = [];
    this.customOpacity = [];

    for (let i = 0; i < this.particleCount; i++) {
        this.position.push(0.0, 0.0, 0.0);
        this.customAngle.push(0.0);
        this.customSize.push(0.0);
        this.customColor.push(0.0, 0.0, 0.0);
        this.customVisible.push(0.0);
        this.customOpacity.push(0.0);
    }


    this.particleGeometry = new THREE.BufferGeometry();
    this.particleTexture = null;
    this.particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    this.particleGeometry.setAttribute('customVisible', new THREE.Float32BufferAttribute(this.customVisible, 1));
    this.particleGeometry.setAttribute('customAngle', new THREE.Float32BufferAttribute(this.customAngle, 1));
    this.particleGeometry.setAttribute('customSize', new THREE.Float32BufferAttribute(this.customSize, 1));
    this.particleGeometry.setAttribute('customOpacity', new THREE.Float32BufferAttribute(this.customOpacity, 1));
    this.particleGeometry.setAttribute('customColor', new THREE.Float32BufferAttribute(this.customColor, 3));
    this.particleMaterial = new THREE.RawShaderMaterial(
        {
            uniforms:
            {
                texture: { type: "t", value: this.particleTexture },
            },
            // attributes:
            // {
            //     customVisible: { type: 'f', value: [] },
            //     customAngle: { type: 'f', value: [] },
            //     customSize: { type: 'f', value: [] },
            //     customColor: { type: 'c', value: [] },
            //     customOpacity: { type: 'f', value: [] }
            // },
            vertexShader: vertShader(),
            fragmentShader: fragShader(),
            transparent: true, // alphaTest: 0.5,  // if having transparency issues, try including: alphaTest: 0.5, 
            blending: THREE.NormalBlending, depthTest: true,

        });
    this.particleMesh = new THREE.Mesh();
}

ParticleEngine.prototype.setValues = function (parameters) {
    if (parameters === undefined) return;

    // clear any previous tweens that might exist
    this.sizeTween = new Tween();
    this.colorTween = new Tween();
    this.opacityTween = new Tween();

    for (var key in parameters)
        this[key] = parameters[key];

    // attach tweens to particles
    Particle.prototype.sizeTween = this.sizeTween;
    Particle.prototype.colorTween = this.colorTween;
    Particle.prototype.opacityTween = this.opacityTween;


    // calculate/set derived particle engine values
    this.particleArray = [];
    this.emitterAge = 0.0;
    this.emitterAlive = true;
    this.particleCount = this.particlesPerSecond * Math.min(this.particleDeathAge, this.emitterDeathAge);

    this.particleGeometry = new THREE.BufferGeometry();
    this.particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    this.particleGeometry.setAttribute('customVisible', new THREE.Float32BufferAttribute(this.customVisible, 1));
    this.particleGeometry.setAttribute('customAngle', new THREE.Float32BufferAttribute(this.customAngle, 1));
    this.particleGeometry.setAttribute('customSize', new THREE.Float32BufferAttribute(this.customSize, 1));
    this.particleGeometry.setAttribute('customOpacity', new THREE.Float32BufferAttribute(this.customOpacity, 1));
    this.particleGeometry.setAttribute('customColor', new THREE.Float32BufferAttribute(this.customColor, 3));
    this.particleMaterial = new THREE.RawShaderMaterial(
        {
            uniforms:
            {
                texture: { type: "t", value: this.particleTexture },
            },
            // attributes:
            // {
            //     customVisible: { type: 'f', value: [] },
            //     customAngle: { type: 'f', value: [] },
            //     customSize: { type: 'f', value: [] },
            //     customColor: { type: 'c', value: [] },
            //     customOpacity: { type: 'f', value: [] }
            // },
            vertexShader: vertShader(),
            fragmentShader: fragShader(),
            transparent: true, alphaTest: 0.5, // if having transparency issues, try including: alphaTest: 0.5, 
            blending: THREE.NormalBlending, depthTest: true
        });
    this.particleMesh = new THREE.ParticleSystem(this.particleGeometry, this.particleMaterial);
}

// helper functions for randomization
ParticleEngine.prototype.randomValue = function (base, spread) {
    return base + spread * (Math.random() - 0.5);
}
ParticleEngine.prototype.randomVector3 = function (base, spread) {
    var rand3 = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    return new THREE.Vector3().addVectors(base, new THREE.Vector3().multiplyVectors(spread, rand3));
}


ParticleEngine.prototype.createParticle = function () {
    var particle = new Particle();

    if (this.positionStyle == Type.CUBE)
        particle.position = this.randomVector3(this.positionBase, this.positionSpread);
    if (this.positionStyle == Type.SPHERE) {
        var z = 2 * Math.random() - 1;
        var t = 6.2832 * Math.random();
        var r = Math.sqrt(1 - z * z);
        var vec3 = new THREE.Vector3(r * Math.cos(t), r * Math.sin(t), z);
        particle.position = new THREE.Vector3().addVectors(this.positionBase, vec3.multiplyScalar(this.positionRadius));
    }

    if (this.velocityStyle == Type.CUBE) {
        particle.velocity = this.randomVector3(this.velocityBase, this.velocitySpread);
    }
    if (this.velocityStyle == Type.SPHERE) {
        var direction = new THREE.Vector3().subVectors(particle.position, this.positionBase);
        var speed = this.randomValue(this.speedBase, this.speedSpread);
        particle.velocity = direction.normalize().multiplyScalar(speed);
    }

    particle.acceleration = this.randomVector3(this.accelerationBase, this.accelerationSpread);

    particle.angle = this.randomValue(this.angleBase, this.angleSpread);
    particle.angleVelocity = this.randomValue(this.angleVelocityBase, this.angleVelocitySpread);
    particle.angleAcceleration = this.randomValue(this.angleAccelerationBase, this.angleAccelerationSpread);

    particle.size = this.randomValue(this.sizeBase, this.sizeSpread);
    particle.sizeTween = this.sizeTween;
    particle.colorTween = this.colorTween;
    particle.opacityTween = this.opacityTween;

    var color = this.randomVector3(this.colorBase, this.colorSpread);
    particle.color = new THREE.Color().setHSL(color.x, color.y, color.z);

    particle.opacity = this.randomValue(this.opacityBase, this.opacitySpread);

    particle.age = 0;
    particle.alive = 0; // particles initialize as inactive

    return particle;
}

ParticleEngine.prototype.initialize = function () {
    // link particle data with geometry/material data
    // console.log(this.particleGeometry);
    for (var i = 0; i < this.particleCount; i++) {
        // remove duplicate code somehow, here and in update function below.
        this.particleArray[i] = this.createParticle();
        this.particleGeometry.attributes.position.array[i * 3] = this.particleArray[i].position.x;
        this.particleGeometry.attributes.position.array[i * 3 + 1] = this.particleArray[i].position.y;
        this.particleGeometry.attributes.position.array[i * 3 + 2] = this.particleArray[i].position.z;
        this.particleGeometry.attributes.customVisible.array[i] = this.particleArray[i].alive;
        this.particleGeometry.attributes.customOpacity.array[i] = this.particleArray[i].opacity;
        this.particleGeometry.attributes.customSize.array[i] = this.particleArray[i].size;
        this.particleGeometry.attributes.customAngle.array[i] = this.particleArray[i].angle;

        this.particleGeometry.attributes.customColor.array[i * 3] = this.particleArray[i].color.r;
        this.particleGeometry.attributes.customColor.array[i * 3 + 1] = this.particleArray[i].color.g;
        this.particleGeometry.attributes.customColor.array[i * 3 + 2] = this.particleArray[i].color.b;


        this.particleGeometry.attributes.position.needsUpdate = true;
        this.particleGeometry.attributes.customColor.needsUpdate = true;
        this.particleGeometry.attributes.customVisible.needsUpdate = true;
        this.particleGeometry.attributes.customOpacity.needsUpdate = true;
        this.particleGeometry.attributes.customSize.needsUpdate = true;
        this.particleGeometry.attributes.customAngle.needsUpdate = true;

    }
    console.log(this.particleGeometry.attributes);


    this.particleMaterial.blending = this.blendStyle;
    if (this.blendStyle != THREE.NormalBlending)
        this.particleMaterial.depthTest = false;

    this.particleMesh = new THREE.ParticleSystem(this.particleGeometry, this.particleMaterial);
    this.particleMesh.dynamic = true;
    this.particleMesh.sortParticles = true;
    scene.add(this.particleMesh);
}

ParticleEngine.prototype.update = function (dt) {
    var recycleIndices = [];

    // update particle data
    for (var i = 0; i < this.particleCount; i++) {
        if (this.particleArray[i].alive) {
            this.particleArray[i].update(dt);

            // check if particle should expire
            // could also use: death by size<0 or alpha<0.
            if (this.particleArray[i].age > this.particleDeathAge) {
                this.particleArray[i].alive = 0.0;
                recycleIndices.push(i);
            }
            // update particle properties in shader

            this.particleGeometry.attributes.position.array[i * 3] = this.particleArray[i].position.x;
            this.particleGeometry.attributes.position.array[i * 3 + 1] = this.particleArray[i].position.y;
            this.particleGeometry.attributes.position.array[i * 3 + 2] = this.particleArray[i].position.z;
            this.particleGeometry.attributes.customVisible.array[i] = this.particleArray[i].alive;
            this.particleGeometry.attributes.customOpacity.array[i] = this.particleArray[i].opacity;
            this.particleGeometry.attributes.customSize.array[i] = this.particleArray[i].size;
            this.particleGeometry.attributes.customAngle.array[i] = this.particleArray[i].angle;

            this.particleGeometry.attributes.customColor.array[i * 3] = this.particleArray[i].color.r;
            this.particleGeometry.attributes.customColor.array[i * 3 + 1] = this.particleArray[i].color.g;
            this.particleGeometry.attributes.customColor.array[i * 3 + 2] = this.particleArray[i].color.b;


            this.particleGeometry.attributes.position.needsUpdate = true;
            this.particleGeometry.attributes.customColor.needsUpdate = true;
            this.particleGeometry.attributes.customVisible.needsUpdate = true;
            this.particleGeometry.attributes.customOpacity.needsUpdate = true;
            this.particleGeometry.attributes.customSize.needsUpdate = true;
            this.particleGeometry.attributes.customAngle.needsUpdate = true;


        }
    }

    // check if particle emitter is still running
    if (!this.emitterAlive) return;

    // if no particles have died yet, then there are still particles to activate
    if (this.emitterAge < this.particleDeathAge) {
        // determine indices of particles to activate
        var startIndex = Math.round(this.particlesPerSecond * (this.emitterAge + 0));
        var endIndex = Math.round(this.particlesPerSecond * (this.emitterAge + dt));
        if (endIndex > this.particleCount)
            endIndex = this.particleCount;

        for (var i = startIndex; i < endIndex; i++)
            this.particleArray[i].alive = 1.0;
    }

    // if any particles have died while the emitter is still running, we imediately recycle them
    for (var j = 0; j < recycleIndices.length; j++) {
        var i = recycleIndices[j];
        this.particleArray[i] = this.createParticle();
        this.particleArray[i].alive = 1.0; // activate right away
        this.particleGeometry.attributes.position.array[i * 3] = this.particleArray[i].position.x;
        this.particleGeometry.attributes.position.array[i * 3 + 1] = this.particleArray[i].position.y;
        this.particleGeometry.attributes.position.array[i * 3 + 2] = this.particleArray[i].position.z;
    }

    // stop emitter?
    this.emitterAge += dt;
    if (this.emitterAge > this.emitterDeathAge) this.emitterAlive = false;
}

ParticleEngine.prototype.destroy = function () {
    scene.remove(this.particleMesh);
}

let fireflies =
{
    positionStyle: Type.CUBE,
    positionBase: new THREE.Vector3(0, 0, -2),
    positionSpread: new THREE.Vector3(10, 10, 10),

    velocityStyle: Type.CUBE,
    velocityBase: new THREE.Vector3(0, 0, 0),
    velocitySpread: new THREE.Vector3(5, 3, 5),

    particleTexture: THREE.ImageUtils.loadTexture('spark.png'),

    sizeBase: 0.6,
    sizeSpread: 0.2,
    opacityTween: new Tween([0.0, 1.0, 1.1, 2.0, 2.1, 3.0, 3.1, 4.0, 4.1, 5.0, 5.1, 6.0, 6.1],
        [0.2, 0.2, 1.0, 1.0, 0.2, 0.2, 1.0, 1.0, 0.2, 0.2, 1.0, 1.0, 0.2]),
    colorBase: new THREE.Vector3(0.30, 1.0, 0.6), // H,S,L
    colorSpread: new THREE.Vector3(0.3, 0.0, 0.0),

    particlesPerSecond: 80,
    particleDeathAge: 6.1,
    emitterDeathAge: 600
}

let engine = new ParticleEngine();
engine.setValues(fireflies);
engine.initialize();



window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.render(scene, camera);
})


const animate = function () {
    requestAnimationFrame(animate);
    var dt = clock.getDelta();
    engine.update(dt * 0.5);
    renderer.render(scene, camera);
};

animate();









/// ------------------ Utils -----------
function createMaterialArray(filename) {
    const skyboxImagepaths = createPathStrings(filename);
    const materialArray = skyboxImagepaths.map(image => {
        let texture = new THREE.TextureLoader().load(image);
        return new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
    });
    return materialArray;
}

function createPathStrings(filename) {
    const basePath = "./Assets/skybox/";
    const baseFilename = basePath;
    const fileType = ".png";
    const sides = ["1", "2", "3", "4", "5", "6"];
    const pathStings = sides.map(side => {
        return baseFilename + side + fileType;
    });
    return pathStings;
}
