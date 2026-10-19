export const workbenchStyles = `
		:root {
			color-scheme: light dark;
		}

		html,
		body {
			min-height: 100%;
			overflow-x: hidden;
			overflow-y: auto;
		}

		body {
			box-sizing: border-box;
			min-height: 100vh;
			margin: 0;
			padding: 20px 20px 72px;
			color: var(--vscode-foreground);
			background: var(--vscode-editor-background);
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
		}

		.request-title {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			margin: 0 0 4px;
			font-size: 20px;
			font-weight: 600;
			line-height: 1.3;
			color: var(--vscode-editor-foreground);
		}

		.request-title-text {
			cursor: text;
		}

		.request-title-input {
			width: min(520px, 80vw);
			height: auto;
			padding: 0;
			color: var(--vscode-editor-foreground);
			background: transparent;
			border: 0;
			border-bottom: 1px solid var(--vscode-focusBorder);
			font: inherit;
		}

		.request-title-input:focus {
			outline: none;
		}

		.request-title-icon {
			width: 16px;
			height: 16px;
			color: var(--vscode-descriptionForeground);
			opacity: 0;
			transition: opacity 120ms ease;
		}

		.request-title:hover .request-title-icon,
		.request-title:focus-within .request-title-icon {
			opacity: 0.65;
		}

		.request-description-area { margin: 0 0 12px; }
		.description-display {
			display: flex;
			align-items: flex-start;
			width: fit-content;
			max-width: 100%;
			gap: 6px;
		}
		#request-description-text {
			min-width: 0;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			line-height: 24px;
			color: var(--vscode-descriptionForeground);
			cursor: text;
		}
		.description-display.expanded #request-description-text { white-space: pre-wrap; overflow-wrap: anywhere; }
		.description-actions {
			display: inline-flex;
			align-items: center;
			flex-shrink: 0;
			gap: 4px;
			opacity: 0;
			pointer-events: none;
		}
		.request-description-area:hover .description-actions,
		.request-description-area:focus-within .description-actions { opacity: 0.75; pointer-events: auto; }
		.description-actions button {
			height: 24px;
			padding: 0 4px;
			border: 0;
			background: transparent;
			color: var(--vscode-descriptionForeground);
			white-space: nowrap;
		}
		#request-description-edit { width: 24px; }
		#request-description-edit svg { width: 16px; height: 16px; vertical-align: middle; }
		#request-description {
			width: 100%;
			min-height: 72px;
			box-sizing: border-box;
			padding: 0;
			font: inherit;
			line-height: 1.5;
			resize: vertical;
			color: var(--vscode-foreground);
			background: transparent;
			border: 0;
			border-bottom: 1px solid var(--vscode-focusBorder);
		}

		.section-divider {
			display: flex;
			align-items: center;
			gap: 12px;
			margin: 18px 0 12px;
			color: var(--vscode-descriptionForeground);
			font-size: 11px;
			font-weight: 700;
			letter-spacing: 0;
			line-height: 1;
			text-transform: uppercase;
		}

		.section-collapse {
			width: 24px;
			height: 24px;
			padding: 4px;
			border: 0;
			background: transparent;
			color: var(--vscode-foreground);
			cursor: pointer;
			flex-shrink: 0;
		}

		.section-collapse:hover {
			background: var(--vscode-toolbar-hoverBackground);
		}

		.section-collapse svg {
			width: 16px;
			height: 16px;
		}

		.section-collapse[aria-expanded="false"] svg {
			transform: rotate(-90deg);
		}

		.section-divider::after {
			content: "";
			flex: 1;
			height: 1px;
			background: var(--vscode-panel-border);
		}

		.section-divider:first-of-type {
			margin-top: 0;
		}

		.request-bar {
			display: grid;
			grid-template-columns: minmax(110px, 140px) minmax(180px, 1fr) auto;
			gap: 8px;
			align-items: center;
		}

		select,
		input,
		button {
			height: 32px;
			box-sizing: border-box;
			font: inherit;
		}

		select,
		input {
			width: 100%;
			color: var(--vscode-input-foreground);
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			padding: 0 8px;
		}

		#method {
			color: var(--vscode-charts-yellow, #d7ba7d);
			font-weight: 600;
		}

		.request-env-options {
			display: flex;
			flex-wrap: wrap;
			gap: 16px;
			margin-bottom: 16px;
		}

		.request-env-options label {
			display: flex;
			align-items: center;
			gap: 6px;
		}

		.request-env-options input[type="radio"] {
			width: 16px;
			height: 16px;
			padding: 0;
			margin: 0;
		}

		.request-env-row {
			display: grid;
			grid-template-columns: minmax(100px, 180px) minmax(0, 1fr) max-content max-content;
			align-items: center;
			justify-content: start;
			gap: 8px;
		}

		.request-env-row label,
		#request-env-open {
			flex-shrink: 0;
		}

		#request-env-path {
			flex: 1;
			min-width: 0;
		}

		#request-env-open:disabled,
		#oauth-get-token:disabled,
		#oauth-cancel-token:disabled,
        #oauth-copy-token:disabled {
			cursor: default;
		}

        .request-auto-authorize {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 20px;
        }

        #request-authorize-before-send {
            width: 16px;
            height: 16px;
            flex: 0 0 16px;
            margin: 0;
            padding: 0;
        }

        .request-auto-authorize-description {
            color: var(--vscode-descriptionForeground);
            margin: 6px 0 0 24px;
            font-size: 12px;
        }

		#request-env-error {
			margin-top: 8px;
			color: var(--vscode-errorForeground);
		}

		.variable-input-wrapper {
			display: block;
			position: relative;
			width: 100%;
		}

		.authorization-field .variable-input-wrapper {
			min-width: 0;
		}

		.variable-highlight-overlay {
			display: none;
			position: absolute;
			inset: 0;
			box-sizing: border-box;
			padding: 0 8px;
			align-items: center;
			overflow: hidden;
			white-space: pre;
			color: var(--vscode-input-foreground);
			background: transparent;
			border: 1px solid transparent;
			font: inherit;
			pointer-events: none;
		}

		.variable-input-wrapper.has-secret-reference .variable-highlight-overlay {
			display: flex;
		}

		.variable-input-wrapper.has-secret-reference input {
			color: transparent;
			caret-color: var(--vscode-input-foreground);
			background: var(--vscode-input-background);
		}

		button {
			color: var(--vscode-button-foreground);
			background: var(--vscode-button-background);
			border: 0;
			padding: 0 14px;
			cursor: pointer;
		}

		.button-icon {
			width: 16px;
			height: 16px;
			vertical-align: middle;
			margin-right: 6px;
			flex-shrink: 0;
		}

		button:hover {
			background: var(--vscode-button-hoverBackground);
		}

		button.request-cancel {
			color: var(--vscode-inputValidation-errorForeground, #fff);
			background: var(--vscode-inputValidation-errorBackground, #a1260d);
		}

		button.request-cancel:hover {
			background: var(--vscode-inputValidation-errorBorder, #c72e0f);
		}

        button.request-cancel:not(:disabled),
        button.request-cancel:not(:disabled):hover {
            color: #fff;
            background: #e02424;
        }

        #oauth-cancel-token:disabled,
        #oauth-cancel-token:disabled:hover {
            color: var(--vscode-inputValidation-errorForeground, #fff);
            background: var(--vscode-inputValidation-errorBackground, #a1260d);
            opacity: 1;
        }

			button:disabled {
				opacity: 0.7;
				cursor: wait;
			}

			.request-panel {
				margin-top: 16px;
				border: 1px solid var(--vscode-panel-border);
				background: var(--vscode-editor-inactiveSelectionBackground);
			}

			.request-tabs-toolbar {
				display: flex;
				align-items: center;
				background: var(--vscode-sideBarSectionHeader-background);
				border-bottom: 1px solid var(--vscode-panel-border);
			}

			.request-tabs-toolbar .request-tabs {
				flex: 1;
				min-width: 0;
				overflow-x: auto;
				border-bottom: 0;
			}

			#request-config-collapse {
				margin: 0 6px;
			}

			.request-tabs {
				display: flex;
				background: var(--vscode-sideBarSectionHeader-background);
				border-bottom: 1px solid var(--vscode-panel-border);
			}

			.request-tab {
				height: 34px;
				color: var(--vscode-editor-foreground);
				background: transparent;
				border: 0;
				border-right: 1px solid var(--vscode-panel-border);
				padding: 0 14px;
				cursor: pointer;
			}

			.request-tab-count {
				color: var(--vscode-descriptionForeground);
				font-size: 0.85em;
			}

			.request-tab.has-values::after {
				content: '';
				display: inline-block;
				width: 5px;
				height: 5px;
				margin-left: 7px;
				border-radius: 50%;
				background: var(--vscode-textLink-foreground);
				vertical-align: middle;
			}

			.request-tab:hover {
				background: var(--vscode-list-hoverBackground);
			}

			.request-tab.active {
				background: var(--vscode-editor-inactiveSelectionBackground);
				box-shadow: inset 0 -2px 0 var(--vscode-focusBorder);
			}

			.request-panel-content {
				padding: 12px;
			}

			.request-headers-table {
				width: 100%;
				border-collapse: collapse;
			}

			.request-headers-table th {
				padding: 0 8px 8px 0;
				text-align: left;
				font-weight: 600;
				color: var(--vscode-descriptionForeground);
			}

			.request-headers-table td {
				padding: 0 8px 8px 0;
			}

			.request-headers-table .request-header-enabled-cell {
				width: 1%;
				vertical-align: middle;
			}

			.request-headers-table td:last-child,
			.request-headers-table th:last-child {
				width: 1%;
				padding-right: 0;
			}

			.request-header-enabled {
				width: 16px;
				height: 16px;
				margin: 0;
				vertical-align: middle;
			}

			.request-header-disabled .request-header-input {
				opacity: 0.65;
			}

			.request-header-input {
				width: 100%;
				min-width: 0;
			}

			.request-header-remove {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				width: 32px;
				padding: 0;
			}

			.request-header-remove svg {
				width: 16px;
				height: 16px;
				pointer-events: none;
			}

			.request-header-add {
				margin-top: 4px;
			}

			.request-body-toolbar {
				display: flex;
				align-items: center;
				gap: 8px;
				margin-bottom: 8px;
				color: var(--vscode-descriptionForeground);
			}

			.authorization-layout {
				display: grid;
				grid-template-columns: minmax(0, 1fr);
				gap: 24px;
				align-items: start;
			}

			.authorization-layout.has-oauth-token-panel {
				grid-template-columns: clamp(300px, var(--authorization-fields-width, 500px), calc(100% - 264px)) minmax(240px, 1fr);
			}

			.oauth-token-panel {
				position: relative;
				min-width: 0;
				min-height: 0;
				align-self: stretch;
				display: grid;
				grid-template-columns: minmax(0, 1fr);
				grid-template-rows: auto minmax(0, 1fr) auto;
				border-left: 1px solid var(--vscode-panel-border);
				padding-left: 24px;
				padding-right: 24px;
                padding-bottom: var(--oauth-actions-bottom, 0px);
                box-sizing: border-box;
				gap: 8px;
			}

            .authorization-resizer {
                position: absolute;
                left: -5px;
                top: 0;
                bottom: 0;
                width: 9px;
                cursor: col-resize;
                touch-action: none;
            }

            .authorization-resizer:hover,
            .authorization-resizer:focus-visible,
            .authorization-resizer.is-dragging {
                background: var(--vscode-focusBorder);
                outline: none;
            }

            #oauth-copy-token {
                grid-row: 3;
                justify-self: start;
                align-self: start;
            }

            .oauth-token-panel.is-token-hidden {
                grid-template-rows: auto auto minmax(0, 1fr);
                padding-bottom: 0;
            }

            .oauth-token-panel.is-token-hidden #oauth-copy-token {
                grid-row: 2;
                margin-top: var(--oauth-grant-gap, 0px);
            }

			.authorization-secret-control {
				display: flex;
				align-items: center;
				gap: 6px;
				min-width: 0;
			}

			.authorization-secret-control > input,
			.authorization-secret-control > .variable-input-wrapper {
				flex: 1;
				min-width: 0;
			}

			#oauth-secret-toggle, #basic-password-toggle {
				flex-shrink: 0;
			}

			.oauth-token-options {
				min-height: 32px;
				align-items: center;
				display: flex;
				flex-wrap: wrap;
				gap: 16px;
			}

			.oauth-token-options label {
				display: flex;
				align-items: center;
				gap: 6px;
				cursor: pointer;
			}

			.oauth-token-options input[type="radio"],
			#oauth-store-token, #oauth-update-header, #oauth-pkce {
				width: 16px;
				height: 16px;
				padding: 0;
				margin: 0;
				flex: 0 0 16px;
				justify-self: start;
			}

			label[for="oauth-store-token"],
			#oauth-store-token {
				margin-top: 8px;
			}

            .oauth-token-actions {
                grid-column: 1 / -1;
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 8px;
                width: max-content;
                margin-top: 12px;
                justify-self: start;
            }

            .oauth-token-actions > button {
                width: 100%;
                white-space: nowrap;
            }

            #oauth-status {
                margin-top: 12px;
            }

			#oauth-status {
				grid-column: 1 / -1;
			}

			.oauth-storage-description {
				grid-column: 1 / -1;
				color: var(--vscode-descriptionForeground);
				font-size: 12px;
			}

			.oauth-token-content {
				grid-row: 2;
				min-width: 0;
				min-height: 0;
				display: flex;
				flex-direction: column;
				padding: 12px 0 0;
			}

			.oauth-token-content p {
				margin: 0 0 8px;
				color: var(--vscode-descriptionForeground);
			}

			.oauth-token-panel label {
				font-weight: 600;
			}

			#oauth-access-token, #oauth-decoded-token {
				border: 0;
				color: var(--vscode-editor-foreground);
				background: var(--vscode-editor-background);
				width: 100%;
				box-sizing: border-box;
				min-height: 0;
				flex: 1 1 0;
				resize: none;
				font-family: var(--vscode-editor-font-family);
				overflow-wrap: anywhere;
			}

            #oauth-decoded-token {
                min-width: 0;
                white-space: pre;
                overflow-wrap: normal;
                overflow: auto;
                padding: 2px;
            }

			@media (max-width: 760px) {
                .authorization-resizer {
                    display: none;
                }
				.authorization-layout.has-oauth-token-panel {
					grid-template-columns: minmax(0, 1fr);
				}
				.authorization-field {
					grid-template-columns: minmax(100px, 140px) minmax(0, 1fr);
				}
				.oauth-token-panel {
					min-height: 260px;
					border-left: 0;
					padding-left: 0;
					padding-right: 0;
					border-top: 1px solid var(--vscode-panel-border);
					padding-top: 16px;
                    padding-bottom: 0;
				}
                .oauth-token-panel.is-token-hidden #oauth-copy-token {
                    margin-top: 0;
                }
			}

			.authorization-field {
				display: grid;
				grid-template-columns: minmax(100px, 180px) minmax(0, 1fr);
				gap: 8px;
				align-items: center;
			}

			.authorization-field label {
				font-weight: 600;
				color: var(--vscode-descriptionForeground);
			}

			.authorization-input {
				min-width: 0;
			}

			.secret-reference {
				color: var(--vscode-charts-yellow, var(--vscode-editorWarning-foreground, var(--vscode-editor-foreground)));
				background: transparent;
			}

			.secret-reference.is-missing,
			.environment-variable-tooltip.is-missing {
				color: var(--vscode-errorForeground, var(--vscode-editorError-foreground, #f14c4c));
			}

			.authorization-divider {
				grid-column: 1 / -1;
				height: 1px;
				margin: 4px 0;
				background: var(--vscode-panel-border);
			}

			.request-body-type-label {
				font-weight: 600;
			}

			.request-body-type {
				width: auto;
				min-width: 180px;
			}

			.request-body-toolbar-spacer {
				flex: 1;
			}

			.request-body-beautify {
				height: 28px;
			}

			.request-body-editor {
				display: grid;
				grid-template-columns: auto minmax(0, 1fr);
				position: relative;
				--hover-line-height: 0px;
				--hover-line-top: 0px;
				background: var(--vscode-editor-background);
			}

			.request-body-editor.line-hover::before,
			.response-body-content.line-hover::before {
				content: "";
				position: absolute;
				top: var(--hover-line-top);
				left: 0;
				right: 0;
				height: var(--hover-line-height);
				background: var(--vscode-editor-lineHighlightBackground, var(--vscode-list-hoverBackground));
				pointer-events: none;
				z-index: 1;
			}

			.request-body-line-numbers {
				margin: 0;
				grid-column: 1;
				grid-row: 1;
				min-width: 44px;
				padding: 12px 8px;
				box-sizing: border-box;
				text-align: right;
				user-select: none;
				white-space: pre-wrap;
				overflow: hidden;
				color: var(--vscode-editorLineNumber-foreground);
				background: var(--vscode-editorGutter-background);
				border-right: 1px solid var(--vscode-panel-border);
				font-family: var(--vscode-editor-font-family);
				font-size: var(--vscode-editor-font-size);
				line-height: 1.45;
				position: relative;
				z-index: 2;
			}

			.request-body-highlight {
				display: block;
				grid-column: 2;
				grid-row: 1;
				margin: 0;
				width: 100%;
				min-height: 140px;
				padding: 12px;
				box-sizing: border-box;
				overflow: hidden;
				white-space: pre-wrap;
				overflow-wrap: anywhere;
				color: var(--vscode-editor-foreground);
				background: transparent;
				border: 0;
				font-family: var(--vscode-editor-font-family);
				font-size: var(--vscode-editor-font-size);
				line-height: 1.45;
				pointer-events: none;
				position: relative;
				z-index: 2;
			}

			.request-body-editor:not(.json-highlight) .request-body-highlight {
				display: none;
			}

			.request-body-editor.variable-highlight .request-body-highlight {
				display: block;
			}

			.json-highlight .request-body-input,
			.variable-highlight .request-body-input {
				color: transparent;
				caret-color: var(--vscode-editor-foreground);
			}

			.json-highlight .request-body-input::placeholder {
				color: var(--vscode-input-placeholderForeground);
			}

			.json-token-key {
				color: var(--vscode-textLink-foreground, var(--vscode-editor-foreground));
			}

			.json-token-string {
				color: var(--vscode-charts-green, var(--vscode-editor-foreground));
			}

			.json-token-number {
				color: var(--vscode-charts-orange, var(--vscode-editor-foreground));
			}

			.json-token-literal {
				color: var(--vscode-charts-purple, var(--vscode-editor-foreground));
			}

			.request-body-input {
				display: block;
				grid-column: 2;
				grid-row: 1;
				width: 100%;
				min-height: 140px;
				padding: 12px;
				box-sizing: border-box;
				resize: vertical;
				color: var(--vscode-editor-foreground);
				background: transparent;
				border: 0;
				font-family: var(--vscode-editor-font-family);
				font-size: var(--vscode-editor-font-size);
				line-height: 1.45;
				position: relative;
				z-index: 2;
			}

			.request-body-input:focus {
				outline: 1px solid var(--vscode-focusBorder);
				outline-offset: -1px;
			}

			.request-body-input:disabled {
				opacity: 0.65;
				cursor: not-allowed;
			}

			.request-body-message {
				margin-top: 8px;
				color: var(--vscode-errorForeground);
			}

			.request-body-form {
				background: transparent;
			}

			.response-divider {
				margin-top: 22px;
			}

			.response-panel {
				margin-top: 12px;
				border: 1px solid var(--vscode-panel-border);
				background: transparent;
			}

			.response-tabs {
				display: flex;
				align-items: center;
				background: var(--vscode-sideBarSectionHeader-background);
				border-bottom: 1px solid var(--vscode-panel-border);
			}

			.response-tab-list {
				display: flex;
			}

			.response-tab {
				height: 34px;
				color: var(--vscode-editor-foreground);
				background: transparent;
				border: 0;
				border-right: 1px solid var(--vscode-panel-border);
				padding: 0 14px;
				cursor: pointer;
			}

			.response-tab:hover {
				background: var(--vscode-list-hoverBackground);
			}

			.response-tab.active {
				background: var(--vscode-editor-background);
				box-shadow: inset 0 -2px 0 var(--vscode-focusBorder);
			}

			.response-status {
				margin-left: auto;
				padding: 0 12px;
				color: var(--vscode-descriptionForeground);
				white-space: nowrap;
			}

			.response-time,
			.response-size {
				font-variant-numeric: tabular-nums;
			}

			.response-time:not(:empty)::after,
			.response-size:not(:empty)::after {
				content: " | ";
				color: var(--vscode-descriptionForeground);
			}

			.response-status-badge {
				display: inline-flex;
				align-items: center;
				min-height: 22px;
				padding: 2px 8px;
				border-radius: 999px;
				box-sizing: border-box;
				font-weight: 600;
				line-height: 1.2;
			}

			.response-status-badge.success {
				color: #ffffff;
				background: #16825d;
			}

			.response-status-badge.error {
				color: #ffffff;
				background: #c73636;
			}

			.response-panel-content {
				min-height: 0;
			}

			.response-content,
			.response-body-content.events-mode { display: block; }
			.events-mode > pre { display: none; }
			.stream-events { padding: 12px; }
			.stream-tools { display: flex; gap: 8px; margin-bottom: 12px; }
			.stream-event { border: 1px solid var(--vscode-panel-border); margin-bottom: 8px; }
			.stream-event summary { cursor: pointer; padding: 8px; overflow-wrap: anywhere; }
			.stream-event pre { padding: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }

			.response-line-numbers {
				margin: 0;
				box-sizing: border-box;
				white-space: pre-wrap;
				font-family: var(--vscode-editor-font-family);
				font-size: var(--vscode-editor-font-size);
				line-height: 1.45;
			}

			.response-content {
				padding: 12px;
				color: var(--vscode-editor-foreground);
			}

			.response-body-content {
				display: grid;
				grid-template-columns: auto minmax(0, 1fr);
				min-height: 220px;
				max-height: max(160px, var(--response-area-max-height, calc(100vh - 320px)));
				overflow: auto;
				position: relative;
				--hover-line-height: 0px;
				--hover-line-top: 0px;
				background: var(--vscode-editor-background);
				cursor: text;
			}

			.response-line-numbers {
				min-width: 44px;
				padding: 12px 8px;
				text-align: right;
				user-select: none;
				color: var(--vscode-editorLineNumber-foreground);
				background: var(--vscode-editorGutter-background);
				border-right: 1px solid var(--vscode-panel-border);
				position: relative;
				z-index: 2;
			}

			.response-body-content .response-content {
				min-width: 0;
				overflow: visible;
				background: transparent;
				cursor: text;
				user-select: text;
				position: relative;
				z-index: 2;
			}

			.response-headers-content {
				min-height: 220px;
				max-height: max(160px, var(--response-area-max-height, calc(100vh - 320px)));
				overflow: auto;
				background: var(--vscode-editor-inactiveSelectionBackground);
			}

			.response-header-name {
				color: var(--vscode-symbolIcon-propertyForeground, var(--vscode-textLink-foreground));
				font-weight: 600;
			}

			#preview-panel {
				min-height: 0;
			}

			.response-preview {
				display: block;
				width: 100%;
				min-height: 220px;
				height: max(160px, var(--response-area-max-height, max(360px, calc(100vh - 260px))));
				max-height: max(160px, var(--response-area-max-height, max(360px, calc(100vh - 260px))));
				border: 0;
				background: #ffffff;
			}

			#response-preview-empty {
				min-height: 220px;
				max-height: max(160px, var(--response-area-max-height, 360px));
				overflow: auto;
			}

			.editor-footer {
				display: flex;
				align-items: center;
				gap: 16px;
				position: fixed;
				right: 0;
				bottom: 0;
				left: 0;
				z-index: 10;
				box-sizing: border-box;
				padding: 8px 20px;
				color: var(--vscode-descriptionForeground);
				background: var(--vscode-editor-background);
				border-top: 1px solid var(--vscode-panel-border);
				font-size: 12px;
				line-height: 1.4;
			}

            .editor-footer-separator {
                width: 1px;
                height: 18px;
                flex: 0 0 1px;
                background: var(--vscode-panel-border);
            }

			.editor-footer-brand {
				margin-left: auto;
				color: var(--vscode-editor-foreground);
				font-weight: 600;
			}

			.editor-footer-icon {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				width: 24px;
				height: 24px;
				flex: 0 0 auto;
				padding: 0;
				color: var(--vscode-editor-foreground);
				background: transparent;
				border: 0;
				border-radius: 4px;
				cursor: pointer;
			}

			.editor-footer-icon:hover,
			.editor-footer-icon:focus {
				background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
			}

			.editor-footer-icon:focus {
				outline: 1px solid var(--vscode-focusBorder);
				outline-offset: 2px;
			}

			.editor-footer-icon svg {
                margin-right: 0;
				width: 16px;
				height: 16px;
				pointer-events: none;
			}

			.editor-footer-version {
				display: inline-flex;
				align-items: center;
				min-height: 20px;
				padding: 2px 8px;
				color: var(--vscode-descriptionForeground);
				background: var(--vscode-editor-inactiveSelectionBackground);
				border: 1px solid var(--vscode-panel-border);
				border-radius: 999px;
				box-sizing: border-box;
				font-size: 11px;
				font-weight: 600;
			}

			.environment-variable-tooltip {
				position: fixed;
				z-index: 20;
				max-width: min(480px, calc(100vw - 24px));
				padding: 6px 9px;
				color: var(--vscode-editorWidget-foreground, var(--vscode-editor-foreground));
				background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
				border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
				border-radius: 4px;
				box-shadow: 0 2px 8px var(--vscode-widget-shadow);
				font: 12px/1.4 var(--vscode-font-family);
				white-space: pre-wrap;
				overflow-wrap: anywhere;
				pointer-events: none;
			}

			.hidden {
				display: none;
			}

		.sr-only {
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			margin: -1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			white-space: nowrap;
			border: 0;
		}

		@media (max-width: 640px) {
			.request-bar {
				grid-template-columns: 1fr;
			}

			.editor-footer {
				align-items: flex-start;
				gap: 8px;
			}
		}
	`;
