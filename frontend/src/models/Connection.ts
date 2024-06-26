export interface ConnectionInterface {
    name: string;
    type: string;
    model: string | null;
    active: boolean;
    extra: object | null;
}

export class Connection implements ConnectionInterface {

    name: string;
    type: string;
    active: boolean;
    model: string | null;
    extra: object | null;

    constructor(name: string, type: string, active: boolean, model: string | null, extra: object | null = null) {
        this.name = name
        this.type = type
        this.active = active || false
        this.model = model
        this.extra = extra
    }

    public static fromJSON({ name, type, active, model, extra }) {
        return new Connection(name, type, active, model, extra)
    }
}