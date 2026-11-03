import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

function createWorld() {

    // ==========================================
    // SZENE
    // ==========================================

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9bcdf2);
    scene.fog = new THREE.Fog(0x9bcdf2, 5000, 18000);

    const camera = new THREE.PerspectiveCamera(
        65,
        window.innerWidth / window.innerHeight,
        0.1,
        50000
    );

    camera.position.set(0, 1800, 4200);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
        antialias: true
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    document.body.appendChild(renderer.domElement);

    // ==========================================
    // LICHT
    // ==========================================

    scene.add(
        new THREE.HemisphereLight(0xc9e7ff, 0x586047, 2)
    );

    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(-6000, 10000, 5000);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.left = -7000;
    sun.shadow.camera.right = 7000;
    sun.shadow.camera.top = 7000;
    sun.shadow.camera.bottom = -7000;
    scene.add(sun);

    // ==========================================
    // INSELGROESSE
    // ==========================================

    const ISLAND_RADIUS = 12500;
    const TERRAIN_SIZE = 30000;

    // ==========================================
    // NOISE
    // ==========================================

    function hash(x, z) {
        const value = Math.sin(
            x * 127.1 + z * 311.7
        ) * 43758.5453;

        return (value - Math.floor(value)) * 2 - 1;
    }

    function noise(x, z) {

        const ix = Math.floor(x);
        const iz = Math.floor(z);

        const fx = x - ix;
        const fz = z - iz;

        const ux = fx * fx * (3 - 2 * fx);
        const uz = fz * fz * (3 - 2 * fz);

        const a = hash(ix, iz);
        const b = hash(ix + 1, iz);
        const c = hash(ix, iz + 1);
        const d = hash(ix + 1, iz + 1);

        return THREE.MathUtils.lerp(
            THREE.MathUtils.lerp(a, b, ux),
            THREE.MathUtils.lerp(c, d, ux),
            uz
        );
    }

    function fbm(x, z) {

        let result = 0;
        let amplitude = 1;
        let frequency = 1;
        let total = 0;

        for (let i = 0; i < 7; i++) {

            result += noise(
                x * frequency,
                z * frequency
            ) * amplitude;

            total += amplitude;
            amplitude *= 0.48;
            frequency *= 2.03;
        }

        return result / total;
    }

    // ==========================================
    // INSELKÜSTE
    // ==========================================

    function getRadius(angle) {

        return ISLAND_RADIUS * (
            1
            + Math.sin(angle * 3 + 1) * 0.09
            + Math.cos(angle * 5) * 0.065
            + Math.sin(angle * 8 + 2) * 0.035
            + Math.cos(angle * 13) * 0.018
        );
    }

    // ==========================================
    // BERGE
    // ==========================================

    function mountain(x, z, mx, mz, radius, height) {

        const dx = x - mx;
        const dz = z - mz;

        const distance = Math.sqrt(
            dx * dx + dz * dz
        );

        const influence = Math.max(
            0,
            1 - distance / radius
        );

        return Math.pow(influence, 1.7) * height;
    }

    // ==========================================
    // FLUSSTÄLER
    // ==========================================

    function riverValley(x, z, offset, amplitude, width) {

        const curve =
            Math.sin(x * 0.00016 + offset) * amplitude +
            Math.sin(x * 0.00038 + offset * 2) * amplitude * 0.35;

        const distance = Math.abs(z - curve);

        return Math.exp(
            -(distance * distance) / (width * width)
        );
    }

    function getHeight(x, z) {

        const distance = Math.sqrt(x * x + z * z);
        const angle = Math.atan2(z, x);

        const radius = getRadius(angle);

        if (distance >= radius) return -150;

        // Großflächige Geländeformen

        let height =
            180 +
            fbm(x * 0.00035, z * 0.00035) * 260 +
            fbm(x * 0.0012, z * 0.0012) * 100 +
            fbm(x * 0.004, z * 0.004) * 30;

        // Große Bergketten

        height += mountain(x, z, -4500, -3000, 4200, 1450);
        height += mountain(x, z, 3500, -4500, 3800, 1250);
        height += mountain(x, z, 5500, 3500, 3200, 950);
        height += mountain(x, z, -5500, 4500, 3500, 1100);
        height += mountain(x, z, 0, 6000, 3000, 850);

        // Hügelregionen

        height += Math.sin(x * 0.0008 + z * 0.0004) * 170;
        height += Math.cos(z * 0.0009 - x * 0.0005) * 130;

        // Tiefe Täler für spätere Flüsse

        const valley1 = riverValley(
            x, z, 0.5, 3200, 850
        );

        const valley2 = riverValley(
            x, -z, 2.3, 2200, 650
        );

        const valley3 = riverValley(
            z, x, 4.1, 2800, 750
        );

        height -= valley1 * 380;
        height -= valley2 * 300;
        height -= valley3 * 350;

        // Unregelmäßige Geländesenken

        height -= Math.max(
            0,
            -fbm(x * 0.0008 + 20, z * 0.0008 + 20)
        ) * 180;

        // Küstenabfall

        const edge = radius - distance;

        if (edge < 1800) {
            height *= THREE.MathUtils.clamp(
                edge / 1800,
                0,
                1
            );
        }

        return height;
    }

    // ==========================================
    // TEXTUREN - POLY HAVEN CC0
    // ==========================================

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");

    function loadTexture(url, repeat) {

        const texture = loader.load(url);

        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeat, repeat);
        texture.anisotropy =
            renderer.capabilities.getMaxAnisotropy();

        return texture;
    }

    const grass = loadTexture(
        "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/forrest_ground_01/forrest_ground_01_diff_2k.jpg",
        180
    );

    const dirt = loadTexture(
        "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/grass_path_2/grass_path_2_diff_2k.jpg",
        150
    );

    const rock = loadTexture(
        "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/aerial_rocks_02/aerial_rocks_02_diff_2k.jpg",
        100
    );

    // ==========================================
    // TERRAIN
    // ==========================================

    const SEGMENTS = 500;

    const geometry = new THREE.PlaneGeometry(
        TERRAIN_SIZE,
        TERRAIN_SIZE,
        SEGMENTS,
        SEGMENTS
    );

    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position;
    const colors = [];

    const grassColor = new THREE.Color(0xffffff);
    const mountainColor = new THREE.Color(0xffffff);
    const valleyColor = new THREE.Color(0x8c8066);

    for (let i = 0; i < positions.count; i++) {

        const x = positions.getX(i);
        const z = positions.getZ(i);

        const distance = Math.sqrt(x * x + z * z);
        const angle = Math.atan2(z, x);

        const radius = getRadius(angle);

        const height = getHeight(x, z);

        positions.setY(i, height);

        let color = grassColor.clone();

        // Felsige Berge

        const rockFactor = THREE.MathUtils.clamp(
            (height - 650) / 800,
            0,
            0.9
        );

        color.lerp(mountainColor, rockFactor);

        // Erdige Täler

        const valley = Math.max(
            riverValley(x, z, 0.5, 3200, 850),
            riverValley(x, -z, 2.3, 2200, 650),
            riverValley(z, x, 4.1, 2800, 750)
        );

        color.lerp(
            valleyColor,
            valley * 0.5
        );

        // Küste

        if (distance > radius - 700) {
            color.lerp(
                new THREE.Color(0xb6a47a),
                0.5
            );
        }

        // Vegetationsvariation

        const variation = fbm(
            x * 0.002,
            z * 0.002
        );

        color.multiplyScalar(
            0.88 + variation * 0.12
        );

        colors.push(
            color.r,
            color.g,
            color.b
        );
    }

    geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colors, 3)
    );

    geometry.computeVertexNormals();

    // ==========================================
    // MATERIAL
    // ==========================================

    const material = new THREE.MeshStandardMaterial({
        map: grass,
        vertexColors: true,
        roughness: 1,
        metalness: 0
    });

    const terrain = new THREE.Mesh(
        geometry,
        material
    );

    terrain.receiveShadow = true;
    terrain.castShadow = true;

    scene.add(terrain);

    // ==========================================
    // INSELUNTERSEITE
    // ==========================================

    const bottomGeometry = new THREE.CylinderGeometry(
        11000,
        10500,
        500,
        160,
        8
    );

    const bottomMaterial = new THREE.MeshStandardMaterial({
        color: 0x514b3d,
        roughness: 1
    });

    const bottom = new THREE.Mesh(
        bottomGeometry,
        bottomMaterial
    );

    bottom.position.y = -350;
    scene.add(bottom);

    // ==========================================
    // ANIMATION
    // ==========================================

    function animate() {

        requestAnimationFrame(animate);

        renderer.render(scene, camera);
    }

    animate();

    // ==========================================
    // RESIZE
    // ==========================================

    window.addEventListener("resize", () => {

        camera.aspect =
            window.innerWidth / window.innerHeight;

        camera.updateProjectionMatrix();

        renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );

    });
}

createWorld();
