export interface ElementBase {
    type: string;
    x: number;
    y: number;
    strokeColor?: string;
    strokeWidth?: number;
    fill?: boolean;
    fillColor?: string;
}

export interface RectangleElement extends ElementBase {
    type: 'rectangle';
    width: number;
    height: number;
}

export interface CircleElement extends ElementBase {
    type: 'circle';
    radius: number;
}

export interface LineElement extends ElementBase {
    type: 'line';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

export interface TextElement extends ElementBase {
    type: 'text';
    text: string;
    fontSize?: number;
    color?: string;
}

export type Element = RectangleElement | CircleElement | LineElement | TextElement;

export interface SketchResult {
    elements: Element[];
    preview?: string;
}