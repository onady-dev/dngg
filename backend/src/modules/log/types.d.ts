export type DailyLog = {
    player: Player[];
}

export type Player = {
    id: number;
    name: string;
    backnumber: number;
    totalScore: number;
    logItem: LogItem;
}

export type LogItem = {
    [id: number]: {
        id: number;
        name: string;
        value: number;
        count: number;
    }
}