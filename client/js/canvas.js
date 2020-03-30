import * as d3 from 'd3'

export class WebwebCanvas {
  get padding() { return 3 }
  get dragBoundary() { return 15 }
  get dpr() { return window.devicePixelRatio || 1}

  constructor(width, height) {
    this.width = width
    this.height = height

    this.canvasWidth = this.width * this.dpr
    this.canvasHeight = this.height * this.dpr

    this.HTMLClass = "webweb-vis-canvas"
    this.HTML = this.getHTML()

    this.boxClass = "webweb-visualization-container"
    this.box = this.getBox()

    this.context = this.HTML.getContext('2d')
    this.context.scale(this.dpr, this.dpr)

    for (let [event, eventFunction] of Object.entries(this.listeners)) {
      this.HTML.addEventListener(event, eventFunction)
    }
  }

  get xTranslate() { return this._xTranslate || 0 }
  set xTranslate(value) { this._xTranslate = value }

  get yTranslate() { return this._yTranslate || 0 }
  set yTranslate(value) { this._yTranslate = value }

  setTranslation(x=0, y=0) {
    this.xTranslate = x
    this.yTranslate = y
    this.context.translate(x, y)
  }

  reset() {
    this.context.restore()
    this.setTranslation(-1 * this.xTranslate, -1 * this.yTranslate)
    this.context.save()
    this.clear()
  }

  get listeners() {
    return {
      "mousedown": event => this.setMouseState(event),
      "mousemove": event => this.setMouseState(event),
      "mouseup": event => this.setMouseState(event),
    }
  }

  getHTML() {
    let HTML = document.createElement("canvas")
    HTML.classList.add(this.HTMLClass)

    HTML.style.width = this.width + "px"
    HTML.style.height = this.height + "px"

    HTML.width = this.canvasWidth
    HTML.height = this.canvasHeight

    return HTML
  }

  getBox() {
    let box = document.createElement("div")
    box.classList.add(this.boxClass)
    box.append(this.HTML)
    return box
  }

  clear() {
    this.context.save()
    this.context.setTransform(1, 0, 0, 1, 0, 0)
    this.context.clearRect(0, 0, this.HTML.width, this.HTML.height)
    this.context.fillStyle = 'white'
    this.context.fillRect(0, 0, this.HTML.width, this.HTML.height)
    this.context.restore()
  }

  redraw() {
    this.clear()
    this.draw()
  }

  defaultDrawProperties() {

  }

  draw() {
    const objects = this.visualization.objectsToDraw
    const objectDrawProperties = objects.map(object => [object.stringifiedDrawProperties, object]).sort()
    let lastPropertyString = undefined
    this.context.save()
    for (let [propertyString, object] of objectDrawProperties) {
      if (propertyString !== lastPropertyString) {
        object.setCanvasContextProperties(this.context)
        lastPropertyString = propertyString
      }

      object.draw(this.context)
    }
  }

  svgDraw() {
    let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    this.visualization.objectsToDraw.forEach(object => svg.appendChild(object.svg))
    return svg
  }

  setMouseState(event) {
    let box = this.HTML.getBoundingClientRect()
    let date = new Date()
    this.mouseState = {
      x: event.clientX - box.left - this.padding - this.xTranslate,
      y: event.clientY - box.top - this.padding - this.yTranslate,
      time: date.getTime(),
    }
    
    this.visualization.mouseState = this.mouseState
  }

  mouseIsWithinDragBoundary(mouseState) {
    const widthMargin = this.width / 2
    const heightMargin = this.height / 2

    if (
      mouseState.x < this.dragBoundary - widthMargin ||
      mouseState.y < this.dragBoundary - heightMargin ||
      mouseState.x > widthMargin - this.dragBoundary ||
      mouseState.y > heightMargin - this.dragBoundary
    ) {
      return true
    }
    return false
  }

  addListeners(listeners) {
    for (let [event, eventFunction] of Object.entries(listeners)) {
      this.HTML.addEventListener(event, eventFunction)
    }
  }

  removeListeners(listeners) {
    for (let [event, eventFunction] of Object.entries(listeners)) {
      this.HTML.removeEventListener(event, eventFunction)
    }
  }
}
