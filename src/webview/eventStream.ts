/** Parses SSE incrementally, retaining incomplete lines and dispatching only data events. */
export function createEventStreamParser(onEvent: (event: { type: string; id: string; data: string }) => void) {
	let buffer = '';
	let data: string[] = [];
	let type = '';
	let id = '';
	let firstLine = true;
	return (chunk: string, finished = false) => {
		buffer += chunk;
		let match: RegExpExecArray | null;
		while ((match = /\r\n|\r|\n/.exec(buffer))) {
			if (!finished && match[0] === '\r' && match.index === buffer.length - 1) {
				break;
			}
			let line = buffer.slice(0, match.index);
			buffer = buffer.slice(match.index + match[0].length);
			if (firstLine) {
				line = line.replace(/^\uFEFF/, '');
				firstLine = false;
			}
			if (!line) {
				if (data.length) {
					onEvent({ type: type || 'message', id, data: data.join('\n') });
				}
				data = [];
				type = '';
				continue;
			}
			const colon = line.indexOf(':');
			const field = colon < 0 ? line : line.slice(0, colon);
			const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
			if (field === 'data') {
				data.push(value);
			} else if (field === 'event') {
				type = value;
			} else if (field === 'id' && !value.includes('\0')) {
				id = value;
			}
		}
		// SSE discards an event that was not terminated by a blank line at EOF.
		if (finished) {
			buffer = '';
			data = [];
		}
	};
}
