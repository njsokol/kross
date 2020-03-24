const express = require("express");
const app = express();
const port = 4500;
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.get('/', (req, res) => res.sendFile(`${__dirname}/client/index.html`))


app.use('/client', express.static(`${__dirname}/client`))

http.listen(port, () => console.log(`Example app listening on port ${port}!`))


const SOCKET_LIST = {};
const DEBUG = true;

class Entity {
    constructor() {
        this.x = 250;
        this.y = 250;
        this.spdX = 0;
        this.spdY = 0;
        this.id = "";
    }

    update() {
        this.updatePosition();
    }

    updatePosition() {
        this.x += this.spdX;
        this.y += this.spdY;
    }
    getDistance(point) {
        return Math.sqrt(Math.pow(this.x - point.x, 2) + Math.pow(this.y - point.y, 2));
    }
}

class Player extends Entity {
    constructor(id) {
        super();
        this.id = id;
        this.number = `P${Math.floor(100 * Math.random())}`;
        this.pressingRight = false;
        this.pressingLeft = false;
        this.pressingUp = false;
        this.pressingDown = false;
        this.pressingAttack = false;
        this.mouseAngle = 0;
        this.maxSpd = 10;
        Player.list[id] = this;
    }

    update() {
        this.updateSpeed();
        super.update();

        if (this.pressingAttack) {
            this.shootBullet(this.mouseAngle);
        }
    }

    shootBullet(angle) {
        const bullet = new Bullet(this.id, angle);
        bullet.x = this.x;
        bullet.y = this.y;
    }

    updateSpeed() {
        if (this.pressingRight) this.spdX = this.maxSpd;
        else if (this.pressingLeft) this.spdX = - this.maxSpd;
        else this.spdX = 0;

        if (this.pressingUp) this.spdY = this.maxSpd;
        else if (this.pressingDown) this.spdY = - this.maxSpd;
        else this.spdY = 0;
    }
}

Player.list = {};

Player.onConnect = (socket) => {
    const player = new Player(socket.id);
    socket.on("keyPress", (data) => {
        const {inputId, state} = data;
        if (inputId === "left")
            player.pressingLeft = state;
        else if (inputId === "right")
            player.pressingRight = state;
        else if (inputId === "up")
            player.pressingUp = state;
        else if (inputId === "down")
            player.pressingDown = state;
        else if (inputId === "attack")
            player.pressingAttack = state;
        else if (inputId === "mouseAngle")
            player.mouseAngle = state;
    })
}

Player.onDisconnect = (socket) => {
    delete Player.list[socket.id];
}

Player.update = () => {
    const pack = [];
    for (let i in Player.list) {
        const player = Player.list[i];
        player.update();
        pack.push({
            x: player.x,
            y: player.y,
            number: player.number
        });
    }
    return pack;
}

class Bullet extends Entity {
    constructor(parent, angle) {
        super();
        this.id = Math.random();
        this.spdX = Math.cos(angle / 180 * Math.PI) * 10;
        this.spdY = Math.sin(angle / 180 * Math.PI) * 10;
        this.timer = 0;
        this.toRemove = false;
        this.parent = parent;
        Bullet.list[this.id] = this;

    }

    update() {
        if (this.timer++ > 100) {
            this.toRemove = true;
        }
        super.update();

        for (let i in Player.list) {
            const p = Player.list[i];
            if (this.getDistance(p) < 32 && this.parent !== p.id) {
                // handle collision hp--;
                this.toRemove = true;
            }
        }
    }
}
Bullet.list = {};

Bullet.update = () => {
    const pack = [];
    for (let i in Bullet.list) {
        const bullet = Bullet.list[i];
        bullet.update();
        if (bullet.toRemove) {
            delete Bullet.list[i];
        }
        else {
            pack.push({
                x: bullet.x,
                y: bullet.y
            });
        }
    }
    return pack;
}

io.on('connection', function (socket) {

    socket.id = Math.random();
    SOCKET_LIST[socket.id] = socket;

    socket.on('disconnect', () => {
        delete SOCKET_LIST[socket.id];
        Player.onDisconnect(socket);
    });

    socket.on("sendMsgToServer", (data) => {
        const playerName = `${socket.id}`.slice(2, 7);
        for (let i in SOCKET_LIST) {
            SOCKET_LIST[i].emit("addToChat", `${playerName}: ${data}`);
        }
    })

    socket.on("evalServer", (data) => {
        if (!DEBUG) return;
        try {
            const res = eval(data)
            socket.emit("evalAnswer", res);
        }
        catch {}
    })

    Player.onConnect(socket);
});

setInterval(() => {
    const pack = {
        player: Player.update(),
        bullet: Bullet.update()
    };

    for (var i in SOCKET_LIST) {
        const socket = SOCKET_LIST[i];
        socket.emit('newPositions', pack);
    }

}, 1000 / 25);
