/** Session-only history stores already-redacted display text, never raw requests. */
export interface NetworkHistoryEntry {
	id: number;
	started: string;
	method: string;
	url: string;
	request: string;
	response?: string;
	status: string;
	durationMs?: number;
	redacted: boolean;
}

export class NetworkHistory {
	private entries: NetworkHistoryEntry[] = [];
	private listeners = new Set<() => void>();

	constructor(private readonly limit = 100) {}

	getEntries(): NetworkHistoryEntry[] {
		return this.entries.map((entry) => ({ ...entry }));
	}

	update(entry: NetworkHistoryEntry): void {
		const index = this.entries.findIndex((item) => item.id === entry.id);
		if (index < 0) {
			// A completion for an entry cleared or evicted while pending stays cleared.
			if (entry.response !== undefined) {
				return;
			}
			this.entries.unshift({ ...entry });
			this.entries.length = Math.min(this.entries.length, this.limit);
		} else {
			this.entries[index] = { ...entry };
		}
		for (const listener of this.listeners) {
			listener();
		}
	}

	clear(): void {
		this.entries = [];
		for (const listener of this.listeners) {
			listener();
		}
	}

	onChange(listener: () => void): { dispose(): void } {
		this.listeners.add(listener);
		return { dispose: () => this.listeners.delete(listener) };
	}
}
