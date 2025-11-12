function polygon(context, color, width, linePoints, dx, dy, offset, canvas_unit) {
    context.fillStyle = color;
    context.strokeStyle = color;
    context.beginPath();
    context.moveTo((linePoints[0][0]+ dx +offset[0])*canvas_unit, (linePoints[0][1]+dy+offset[1])*canvas_unit)
    for (let i = 1; i < linePoints.length; ++i) {
        context.lineTo((linePoints[i][0] + dx + offset[0])*canvas_unit, (linePoints[i][1] + dy + offset[1])*canvas_unit)
    }
    if (width > 0) {
        context.lineTo((linePoints[0][0] + dx + offset[0])*canvas_unit, (linePoints[0][1] + dy + offset[1])*canvas_unit)
        context.lineWidth = width;
        context.stroke();
    } else {
        context.fill();
    }
}

function  updateBoundingRect(linePoints) {
    let max = {width: Number.MIN_VALUE, height: Number.MIN_VALUE}
    let min = {width: Number.MAX_VALUE, height: Number.MAX_VALUE}
    for (let i = 0; i < linePoints.length; ++i) {
        max.width = Math.max(max.width, linePoints[i][0]);
        max.height = Math.max(max.height, linePoints[i][1]);
        min.width = Math.min(min.width, linePoints[i][0]);
        min.height = Math.min(min.height, linePoints[i][1]);
    }
    return {x:  Math.round(min.width), y: Math.round(min.height), width: Math.round(max.width-min.width), height: Math.round(max.height-min.height)}
}
    

function toFixed(num, fixed) {
    fixed = fixed || 0;
    fixed = Math.pow(10, fixed);
    return Math.floor(num * fixed) / fixed;
}

function hexToRgb(hex, normalize=true) {
    // Remove leading '#' if present
    hex = hex.toString().replace(/^#/, '');

    // Handle shorthand hex (e.g., #fff)
    if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
    }

    const num = parseInt(hex, 16);
    let r = (num >> 16) & 255;
    let g = (num >> 8) & 255;
    let b = num & 255;
    if (normalize) {
        r = toFixed(r/255, 2)
        g = toFixed(g/255, 2)
        b = toFixed(b/255, 2)
    }

    return `rgb(${r}, ${g}, ${b})`
}

function rotate(radians, cx, cy, x, y, yIsUp=1) {
    let dx = x - cx 
    let dy = y - cy
    let cos = Math.cos(radians)
    let sin = Math.sin(radians)
    return [Math.round(cx + dx * cos - dy * sin), Math.round(cy + yIsUp * (dx * sin + dy * cos))]
}

class ExcalidrawToAsy {
    static ARROW = {
        "triangle": "ArcArrow(size=20)",
        "arrow": "Arrow(TeXHead, size=10)" // Hook Head?
    }
    constructor() {
        this.elements = []
        this.dummy = null
        this.types = {}
        this.text = ""
    }

    init() {
        this.addType("rectangle", 
        (e) => {
            this.default(e)
            console.log(this.dummy)
            this.dummy.coords = [
                rotate(this.dummy.angle, this.dummy.cx, this.dummy.cy, this.dummy.x, this.dummy.y),
                rotate(this.dummy.angle, this.dummy.cx, this.dummy.cy, this.dummy.x + this.dummy.width, this.dummy.y),
                rotate(this.dummy.angle, this.dummy.cx, this.dummy.cy, this.dummy.x + this.dummy.width, this.dummy.y + this.dummy.height),
                rotate(this.dummy.angle, this.dummy.cx, this.dummy.cy, this.dummy.x, this.dummy.y + this.dummy.height)
            ]
        }, 
        (o) => {
            o.height *= - 1
            o.y *= -1
            // let path2 = `(${o.x}, ${o.y})--(${o.x + o.width}, ${o.y})--(${o.x + o.width}, ${o.y + o.height})--(${o.x}, ${o.y + o.height})--cycle`
            let path = `(${o.coords[0][0]}, ${-o.coords[0][1]})--(${o.coords[1][0]}, ${-o.coords[1][1]})--(${o.coords[2][0]}, ${-o.coords[2][1]})--(${o.coords[3][0]}, ${-o.coords[3][1]})--cycle` 
            o.y *= -1
            o.height *= - 1
            if (o.roundness) {
                // TODO
            } else {
                if (this.closed) {
                    this.dummy += `filldraw(${path}, ${o.backgroundColor}, ${this.getPen(o)});\n`
                } else {
                    this.dummy += `draw(${path}, ${this.getPen(o)});`
                }
                //  this.dummy += `draw(${path2}, black);\n`
            }
            path = null
        },
        (ctx, o) => {
            polygon(ctx, o.trueColors.background, 0, o.coords, 0, 0, [0, 0], 1) 
            polygon(ctx, o.trueColors.stroke, o.strokeWidth, o.coords, 0, 0, [0, 0], 1) 
        })

        this.addType("ellipse", 
        (e) => {
            this.default(e)
        },
        (o) => {
            o.cy *= -1
            o.angle *= -1
            let path = `shift(${o.cx}, ${o.cy}) * rotate(${Math.floor(o.angle*180/Math.PI)}) * ellipse((0, 0), ${o.width/2}, ${o.height/2})`
            
            if (o.closed) {
                this.dummy = `filldraw(${path}, ${o.backgroundColor}, ${this.getPen(o)});`
            } else {
                this.dummy = `draw(${path}, ${this.getPen(o)});`
            }
            this.dummy += "\n"
            // this.dummy += `\ndot((${o.cx}, ${o.cy})); \n`
            o.cy *= -1
            o.angle *= -1
        },
        (ctx, e) => {
            ctx.beginPath()
            ctx.ellipse(e.cx, e.cy, e.width/2, e.height/2, e.angle, 0, 2 * Math.PI)
            ctx.fill()
            ctx.stroke()
            ctx.closePath()
        })

        this.addType("line", (e) => {
            this.default(e)
            this.dummy.cy = this.dummy.y - this.dummy.height/2
            // this.dummy.points = Array.from(e.points, x => rotate(this.dummy.angle, this.dummy.width/2, -this.dummy.height/2, x[0], x[1]) )
            this.dummy.sus = updateBoundingRect(e.points)
            this.dummy.points = Array.from(e.points, x => rotate(this.dummy.angle, this.dummy.sus.x + this.dummy.sus.width/2, this.dummy.sus.y + this.dummy.sus.height/2, x[0], x[1]) )
        }, 
        (o) => {
            let testy = o.points.map(pt => `(${Math.round(pt[0] + o.x)}, ${-Math.round(pt[1] + o.y)})`).join("--");
            if (o.closed) {
                this.dummy = `filldraw(${testy}--cycle, ${o.backgroundColor}, ${this.getPen(o)});\n`
            } else {
                this.dummy = `draw(${testy}, ${this.getPen(o)});\n`
            }
            // this.dummy += `dot((${o.x}, ${-o.y}));\n`
        },
        (ctx, e) => {
            // x, y bottom left
            polygon(ctx, e.trueColors.background, 0, e.points, 0, 0, [e.x, e.y], 1)
            
            polygon(ctx, e.trueColors.stroke, e.strokeWidth, e.points, 0, 0, [e.x, e.y], 1)

            // ctx.strokeRect(e.sus.x + e.x, e.sus.y + e.y, e.sus.width, e.sus.height)
            // ctx.fillRect(e.x + e.sus.x + e.sus.width/2, e.y + e.sus.y + e.sus.height/2, 10, 10)

        })
        this.addType("arrow", 
            (e) => {
                this.types["line"].parse(e)
                // Arrow, HookHead, TexHead
                this.dummy.arrowheads = [e.startArrowhead, e.endArrowhead]
                for (let i = 0; i < this.dummy.arrowheads.length; i++) {
                    if (this.dummy.arrowheads[i]) {
                        this.dummy.arrowheads[i] = ExcalidrawToAsy.ARROW[this.dummy.arrowheads[i]]
                    }
                }
                console.log(this.dummy.arrowheads)
            },
            (o) => {
                let pathLeft, pathRight;

                if (o.points.length > 2) {
                    pathRight = o.points.slice(1, o.points.length).map(pt => `(${Math.round(pt[0] + o.x)}, ${-Math.round(pt[1] + o.y)})`).join("--");
                    pathLeft = o.points.slice(0, 2).map(pt => `(${Math.round(pt[0] + o.x)}, ${-Math.round(pt[1] + o.y)})`).join("--");
                } else { // ie o.points.length == 2
                    let midpoint = [0.5*(o.points[0][0] + o.points[1][0]) + o.x, -0.5*(o.points[0][1] + o.points[1][1]) - o.y]
                    pathLeft = `(${midpoint[0]}, ${midpoint[1]})--(${o.points[0][1] + o.x}, ${-o.points[0][1]-o.y})`
                    pathRight = `(${midpoint[0]}, ${midpoint[1]})--(${o.points[1][0] + o.x}, ${- o.points[1][1] - o.y})`
                }
                this.dummy = `draw(${pathRight}, ${this.getPen(o)}${(o.arrowheads[1] == null) ? "" : (", arrow="+o.arrowheads[1]) });\n`
                this.dummy += `draw(${pathLeft}, ${this.getPen(o)}${(o.arrowheads[0] == null) ? "" : (", arrow="+o.arrowheads[0]) });\n`
                // this.dummy = `draw(${testy}, ${this.getPen(o)}, arrow=${o.arrowheads[1]});\n`
            },
            (ctx, e) => {

            }
        )
        this.addType("freedraw", 
            (e) => {
                // e.strokeColor = e.backgroundColor
                e.backgroundColor = "transparent"
                e.strokeStyle = "solid"
                this.types["line"].parse(e)
                this.dummy.strokeWidth += 4
            },
            (o) => {
                let testy = o.points.map(pt => `(${Math.round(pt[0] + o.x)}, ${-Math.round(pt[1] + o.y)})`).join("..");
                this.dummy = `draw(${testy}, ${this.getPen(o)});\n`
            },
            (ctx, e) => {

            }
        )

        this.addType("text",
            (e) => {
                // e.x += e.width/2
                // e.y += e.height/2
                this.default(e)
                this.dummy.text = e.text
                this.dummy.fontSize = e.fontSize
            },
            (o) => {
                this.dummy = `label("${o.text}", (${o.x+o.width/2}, ${-o.y-o.height/2}), fontsize(${Math.round(o.fontSize)}pt) + ${this.getPen(o)});\n`
                // *rotate(${Math.round(o.angle * 180/Math.PI)})
            },
            (ctx, e) => {
                ctx.fillStyle = "black"
                ctx.fillRect(e.x, e.y, e.width, e.height)
                ctx.fillText(e.text, e.x, e.y)
            }
        )
    }

    getPen(o) {return `${o.strokeColor}+linewidth(${o.strokeWidth})+${(o.strokeStyle)}`}

    setCanvasPen(o, ctx) {
        ctx.lineWidth = o.strokeWidth
        ctx.fillStyle = o.trueColors.background
        ctx.strokeStyle = o.trueColors.stroke
        if (o.strokeStyle === "dashed") {
            ctx.setLineDash([10, 10])
        } else {
            ctx.setLineDash([])
        }
    }

    default(e) {
        console.log(e)
        this.dummy.type = e.type
        this.dummy.strokeColor = hexToRgb(e.strokeColor)
        this.dummy.strokeWidth = e.strokeWidth
        this.dummy.strokeStyle = e.strokeStyle
        this.dummy.fillStyle = e.fillStyle
        this.dummy.closed = !(e.backgroundColor === "transparent")
        this.dummy.backgroundColor = hexToRgb(e.backgroundColor)
        if (!this.dummy.closed) {
            this.dummy.backgroundColor += "+opacity(0.0)"
        }
        if (e.strokeColor === "transparent") {
            this.dummy.strokeWidth = 0
        }
        this.dummy.trueColors = {stroke: e.strokeColor, background: e.backgroundColor}
        this.dummy.x = Math.round(e.x)
        this.dummy.y = Math.round(e.y)
        this.dummy.width = Math.round(e.width)
        this.dummy.height = Math.round(e.height)
        this.dummy.angle = Math.round(e.angle * 100)/100
        this.dummy.cx = this.dummy.x + this.dummy.width/2
        this.dummy.cy = this.dummy.y + this.dummy.height/2
        this.dummy.cos = Math.cos(this.dummy.angle)
        this.dummy.sin = Math.sin(this.dummy.angle)
        this.dummy.opacity = e.opacity/100
        this.dummy.roundness = (e.roundness != null)
    }

    addType(type, callback, asy, canvasDraw) {this.types[type] = {parse: callback, asymptote: asy, canvasDraw: canvasDraw}}

    parse(data) {
        data.elements.forEach(element => {
            if (this.types.hasOwnProperty(element.type)) {
                this.dummy = {}
                this.types[element.type].parse.call(this, element)
                this.elements.push(this.dummy)
                this.dummy = null
            } else {
                console.log(`${element.type} not recognized`)
            }
        });
    } 

    toAsymptote() {
        this.text += "/* Generated by Cloud's Excalidraw to Asymptote */\n"
        this.elements.forEach(element => {
            this.dummy = ""
            this.types[element.type].asymptote(element)
            this.text += this.dummy
        })
        // import roundedpath;
        // draw(roundedpath((0,0)--(0,10)--(23,10)--(23, 0)--cycle, 4), red);
    }

    draw(ctx) {
        this.elements.forEach(e => {
            this.setCanvasPen(e, ctx)
            this.types[e.type].canvasDraw(ctx, e)
        })
    }
}

function test () {
    let context = canvas.getContext("2d")
    let parser = new ExcalidrawToAsy()
    parser.init()
    bruh.onchange = () => {
        if (bruh.value.trim() === "") {return;}
        parser.text = ""
        parser.elements = []
        parser.parse(JSON.parse(bruh.value))
        console.log(parser.elements)
        parser.toAsymptote()
        console.log(parser.text)
        parser.draw(context)
        textDisplayer.textContent = parser.text
    }

}

test()
