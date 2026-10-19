import { buttonIcons } from './buttonIcons';
import { createEventStreamParser } from './eventStream';

export function workbenchScript(): string {
	return `
			const vscode = acquireVsCodeApi();
            const buttonIcons = ${JSON.stringify(buttonIcons)};
			const form = document.getElementById('request-form');
            const requestDescription = document.getElementById('request-description');
            const descriptionDisplay = document.getElementById('description-display');
            const requestDescriptionText = document.getElementById('request-description-text');
            const requestDescriptionEdit = document.getElementById('request-description-edit');
            const requestDescriptionToggle = document.getElementById('request-description-toggle');
            let descriptionExpanded = false;
            requestDescriptionEdit.addEventListener('click', startDescriptionEdit);
            requestDescriptionText.addEventListener('click', startDescriptionEdit);
            requestDescriptionToggle.addEventListener('click', () => {
                descriptionExpanded = !descriptionExpanded;
                renderDescription();
            });
            requestDescription.addEventListener('input', () => { notifyRequestChanged(); updateResponseAreaBounds(); });
            requestDescription.addEventListener('blur', finishDescriptionEdit);
            requestDescription.addEventListener('keydown', event => {
                if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                    event.preventDefault();
                    requestDescription.blur();
                }
            });
            window.addEventListener('resize', renderDescription);
            const requestConfigCollapse = document.getElementById('request-config-collapse');
            const requestConfigContent = document.getElementById('request-config-content');
            requestConfigCollapse.addEventListener('click', () => toggleRequestSection(requestConfigCollapse, requestConfigContent, 'request configuration'));
            ['request', 'response'].forEach((name) => {
                const button = document.getElementById(name + '-collapse');
                const section = document.getElementById(name + '-section');
                button.addEventListener('click', () => toggleRequestSection(button, section, name));
            });
			const requestTitleContainer = document.getElementById('request-title-container');
			const requestTitle = document.getElementById('request-title');
			const requestTitleInput = document.getElementById('request-title-input');
				const method = document.getElementById('method');
				const url = document.getElementById('url');
				const send = document.getElementById('send');
				let activeRequestId = 0;
				let requestInProgress = false;
			const environmentVariableTooltip = document.getElementById('environment-variable-tooltip');
				const requestParamsTab = document.getElementById('request-params-tab');
				const requestAuthorizationTab = document.getElementById('request-authorization-tab');
				const requestHeadersTab = document.getElementById('request-headers-tab');
				const requestBodyTab = document.getElementById('request-body-tab');
                const automationTab = document.getElementById('request-automation-tab');
                const automationPanel = document.getElementById('request-automation-panel');
                const automationRows = document.getElementById('automation-rows');
                function readAutomation() {
                    return Array.from(automationRows.children).map(row => ({
                        enabled: row.children[0].firstChild.checked,
                        header: row.children[1].firstChild.value.trim(),
                        variable: row.children[2].firstChild.value.trim(),
                    }));
                }
                function addAutomationRow(mapping) {
                    const row = document.createElement('tr');
                    for (const field of ['enabled', 'header', 'variable']) {
                        const cell = document.createElement('td');
                        const input = document.createElement('input');
                        input.type = field === 'enabled' ? 'checkbox' : 'text';
                        input.className = field === 'enabled' ? 'request-header-enabled' : 'request-header-input';
                        if (field === 'enabled') { cell.className = 'request-header-enabled-cell'; }
                        else { input.placeholder = field === 'header' ? 'Response header' : 'Environment variable'; }
                        input.setAttribute('aria-label', field === 'header' ? 'Response header' : field === 'variable' ? 'Environment variable' : 'Enable mapping');
                        if (field === 'enabled') { input.checked = mapping.enabled; }
                        else { input.value = mapping[field]; }
                        input.addEventListener('input', () => {
                            const value = input.value.trim();
                            const valid = field === 'enabled' || !value || (field === 'variable'
                                ? /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
                                : /^[A-Za-z0-9!#$%&'*+.^_|~-]+$/.test(value));
                            input.setCustomValidity(valid ? '' : 'Enter a valid ' + (field === 'variable' ? 'environment variable name.' : 'HTTP header name.'));
                            notifyRequestChanged();
                        });
                        input.addEventListener('change', () => {
                            updateRequestRowEnabledState(row, row.children[0].firstChild.checked);
                            notifyRequestChanged();
                        });
                        cell.appendChild(input);
                        row.appendChild(cell);
                    }
                    const cell = document.createElement('td');
                    const remove = document.createElement('button');
                    remove.type = 'button';
                    remove.className = 'request-header-remove';
                    remove.ariaLabel = 'Remove mapping';
                    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
                    remove.addEventListener('click', () => { row.remove(); notifyRequestChanged(); });
                    cell.appendChild(remove);
                    row.appendChild(cell);
                    updateRequestRowEnabledState(row, mapping.enabled);
                    automationRows.appendChild(row);
                }
                document.getElementById('automation-add').addEventListener('click', () => {
                    addAutomationRow({ enabled: true, header: '', variable: '' });
                    notifyRequestChanged();
                });
                automationTab.addEventListener('click', () => showRequestTab('automation'));
                const requestSettingsTab = document.getElementById('request-settings-tab');
                const requestSettingsPanel = document.getElementById('request-settings-panel');
                const authorizeBeforeSend = document.getElementById('request-authorize-before-send');
                let authorizationBeforeSendPending = false;
                let oauthSendWaiter;
                authorizeBeforeSend.addEventListener('change', () => {
                    if (authorizationBeforeSendPending) { document.getElementById('oauth-cancel-token').click(); }
                    notifyRequestChanged();
                });

                const requestEnvPath = document.getElementById('request-env-path');
                const requestEnvOpen = document.getElementById('request-env-open');
                const requestEnvError = document.getElementById('request-env-error');
                let defaultTokenView = 'raw';
                let autoGenerateAuthorizationCodeState = false;
                const requestEnvNearest = document.getElementById('request-env-nearest');
                const requestEnvManual = document.getElementById('request-env-manual');
                const requestEnvChoose = document.getElementById('request-env-choose');
                let manualEnvironmentPath = '';
                let environmentSelectionRequestId = 0;
                [requestEnvNearest, requestEnvManual].forEach(option => option.addEventListener('change', () => {
                    vscode.postMessage({ type: 'cancelOAuthToken' });
                    oauthRequestId++;
                    oauthPending = false;
                    oauthGetToken.disabled = false;
                    environmentSelectionRequestId++;
                    requestEnvChoose.classList.toggle('hidden', !requestEnvManual.checked);
                    notifyRequestChanged();
                    refreshEnvironmentFile();
                    refreshConfiguredOAuthToken();
                    updateOAuthTokenDisplay();
                    scheduleEnvironmentVariableCheck();
                }));
                requestEnvChoose.addEventListener('click', () => {
                    vscode.postMessage({ type: 'chooseEnvironmentFile', requestId: ++environmentSelectionRequestId });
                });
                let environmentFileRequestId = 0;
                requestSettingsTab.addEventListener('click', () => {
                    showRequestTab('settings');
                    refreshEnvironmentFile();
                });
                requestEnvOpen.addEventListener('click', () => vscode.postMessage({ type: 'openEnvironmentFile' }));
				const requestParamsPanel = document.getElementById('request-params-panel');
				const requestAuthorizationPanel = document.getElementById('request-authorization-panel');
				const requestHeadersPanel = document.getElementById('request-headers-panel');
				const requestBodyPanel = document.getElementById('request-body-panel');
				const authorizationType = document.getElementById('authorization-type');
                const oauthGrantType = document.getElementById('oauth-grant-type');
                const oauthGetToken = document.getElementById('oauth-get-token');
                const oauthStatus = document.getElementById('oauth-status');
                const oauthClientSecret = document.getElementById('oauth-client-secret');
                const oauthSecretToggle = document.getElementById('oauth-secret-toggle');
                oauthSecretToggle.addEventListener('click', () => setOAuthSecretVisible(oauthClientSecret.type === 'password'));
                const oauthAccessToken = document.getElementById('oauth-access-token');
                const oauthDecodedToken = document.getElementById('oauth-decoded-token');
                const oauthHiddenOption = document.getElementById('oauth-hidden-option');
                const oauthRawOption = document.getElementById('oauth-raw-option');
                const oauthDecodedOption = document.getElementById('oauth-decoded-option');
                const oauthRawPanel = document.getElementById('oauth-raw-panel');
                const oauthDecodedPanel = document.getElementById('oauth-decoded-panel');
                oauthHiddenOption.addEventListener('change', () => showOAuthTokenView('hidden'));
                oauthRawOption.addEventListener('change', () => showOAuthTokenView('raw'));
                oauthDecodedOption.addEventListener('change', () => showOAuthTokenView('decoded'));
                const oauthTokenPanel = document.getElementById('oauth-token-panel');
                const oauthCopyToken = document.getElementById('oauth-copy-token');
                oauthCopyToken.addEventListener('click', () => {
                    if (authorizationType.value === 'oauth2' && displayedOAuthToken) {
                        vscode.postMessage({ type: 'copyOAuthToken', token: displayedOAuthToken });
                    }
                });

                const authorizationLayout = document.getElementById('authorization-layout');
                const authorizationFields = document.querySelector('.authorization-field');
                const authorizationResizer = document.getElementById('authorization-resizer');
                let authorizationResizePointer;
                let authorizationResizeOffset = 0;
                function resizeAuthorizationFields(width) {
                    const available = authorizationLayout.getBoundingClientRect().width - 264;
                    const initial = Math.min(500, available);
                    const minimum = Math.max(300, initial - 120);
                    const maximum = Math.max(minimum, Math.min(available, initial + 120));
                    const next = Math.round(Math.max(minimum, Math.min(maximum, width)));
                    authorizationLayout.style.setProperty('--authorization-fields-width', next + 'px');
                    authorizationResizer.setAttribute('aria-valuemin', String(minimum));
                    authorizationResizer.setAttribute('aria-valuemax', String(maximum));
                    authorizationResizer.setAttribute('aria-valuenow', String(next));
                }
                authorizationResizer.addEventListener('pointerdown', (event) => {
                    if (event.button !== 0) { return; }
                    event.preventDefault();
                    authorizationResizePointer = event.pointerId;
                    authorizationResizeOffset = event.clientX - authorizationFields.getBoundingClientRect().right;
                    authorizationResizer.setPointerCapture(event.pointerId);
                    authorizationResizer.classList.add('is-dragging');
                });
                authorizationResizer.addEventListener('pointermove', (event) => {
                    if (event.pointerId !== authorizationResizePointer) { return; }
                    resizeAuthorizationFields(event.clientX - authorizationResizeOffset - authorizationLayout.getBoundingClientRect().left);
                });
                authorizationResizer.addEventListener('lostpointercapture', () => {
                    authorizationResizePointer = undefined;
                    authorizationResizer.classList.remove('is-dragging');
                });
                authorizationResizer.addEventListener('keydown', (event) => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) { return; }
                    event.preventDefault();
                    const width = authorizationFields.getBoundingClientRect().width;
                    resizeAuthorizationFields(event.key === 'Home' ? 500 : width + (event.key === 'ArrowLeft' ? -20 : 20));
                });
                authorizationResizer.addEventListener('dblclick', () => resizeAuthorizationFields(500));
                const oauthButtonAlignmentObserver = new ResizeObserver(() => {
                    if (window.innerWidth > 760 && authorizationLayout.classList.contains('has-oauth-token-panel')) {
                        resizeAuthorizationFields(authorizationFields.getBoundingClientRect().width);
                    }
                    const fieldsRect = authorizationFields.getBoundingClientRect();
                    const fieldsBottom = fieldsRect.bottom;
                    const actionsBottom = oauthGetToken.getBoundingClientRect().bottom;
                    oauthTokenPanel.style.setProperty('--oauth-actions-bottom', Math.max(0, fieldsBottom - actionsBottom) + 'px');
                    const optionsHeight = document.querySelector('.oauth-token-options').getBoundingClientRect().height;
                    const grantTop = oauthGrantType.getBoundingClientRect().top - fieldsRect.top;
                    oauthTokenPanel.style.setProperty('--oauth-grant-gap', Math.max(0, grantTop - optionsHeight - 8) + 'px');
                });
                oauthButtonAlignmentObserver.observe(authorizationFields);
                oauthButtonAlignmentObserver.observe(document.querySelector('.oauth-token-options'));

                const oauthUpdateHeader = document.getElementById('oauth-update-header');
                oauthUpdateHeader.addEventListener('change', () => notifyRequestChanged());
                const oauthStoreToken = document.getElementById('oauth-store-token');
                const oauthTokenVariable = document.getElementById('oauth-token-variable');
                oauthStoreToken.addEventListener('change', () => {
                    vscode.postMessage({ type: 'cancelOAuthToken' });
                    oauthRequestId++;
                    oauthPending = false;
                    oauthGetToken.disabled = false;
                    oauthStatus.textContent = '';
                    applyAuthorizationType();
                    notifyRequestChanged();
                });
                oauthTokenVariable.addEventListener('input', () => {
                    vscode.postMessage({ type: 'cancelOAuthToken' });
                    oauthRequestId++;
                    oauthPending = false;
                    oauthGetToken.disabled = false;
                    oauthStatus.textContent = '';
                    notifyRequestChanged();
                });
                let oauthToken = '';
                let displayedOAuthToken = '';
                let configuredOAuthTokenRequestId = 0;
                let oauthRequestId = 0;
                let oauthPending = false;
                oauthGrantType.addEventListener('change', () => {
                    if (autoGenerateAuthorizationCodeState && authorizationType.value === 'oauth2' && oauthGrantType.value === 'authorization_code' && !document.getElementById('oauth-state').value) {
                        generateOAuthState();
                    }
                    vscode.postMessage({ type: 'cancelOAuthToken' });
                    oauthToken = '';
                    displayedOAuthToken = '';
                    oauthStatus.textContent = '';
                    oauthRequestId++;
                    oauthPending = false;
                    oauthGetToken.disabled = false;
                    refreshConfiguredOAuthToken();
                    applyAuthorizationType();
                    notifyRequestChanged();
                });
                ['oauth-url', 'oauth-client-id', 'oauth-client-secret', 'oauth-scope', 'oauth-authorization-url', 'oauth-state'].forEach((id) => {
                    document.getElementById(id).addEventListener('input', () => {
                        updateSecretReferenceState(document.getElementById(id));
                        oauthCopyToken.disabled = true;
                        vscode.postMessage({ type: 'cancelOAuthToken' });
                        oauthRequestId++;
                        oauthPending = false;
                        oauthGetToken.disabled = false;
                        oauthToken = '';
                    displayedOAuthToken = '';
                        oauthStatus.textContent = '';
                        if (authorizationType.value !== 'oauth2') {
                            syncAuthorizationHeader();
                        }
                        notifyRequestChanged();
                    });
                });
                document.getElementById('oauth-client-authentication').addEventListener('change', () => {
                    vscode.postMessage({ type: 'cancelOAuthToken' });
                    oauthRequestId++;
                    oauthPending = false;
                    oauthGetToken.disabled = false;
                    oauthStatus.textContent = '';
                    if (document.getElementById('oauth-client-authentication').value === 'none') {
                        document.getElementById('oauth-client-secret').value = '';
                    }
                    setOAuthSecretVisible(false);
                    applyAuthorizationType();
                    scheduleEnvironmentVariableCheck();
                    notifyRequestChanged();
                });
                function generateOAuthState() {
                    const bytes = crypto.getRandomValues(new Uint8Array(32));
                    document.getElementById('oauth-state').value = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
                    document.getElementById('oauth-state').dispatchEvent(new Event('input', { bubbles: true }));
                }
                document.getElementById('oauth-generate-state').addEventListener('click', generateOAuthState);
                document.getElementById('oauth-pkce').addEventListener('change', () => {
                    vscode.postMessage({ type: 'cancelOAuthToken' });
                    oauthRequestId++;
                    oauthPending = false;
                    oauthGetToken.disabled = false;
                    oauthStatus.textContent = '';
                    notifyRequestChanged();
                });
                document.getElementById('oauth-copy-redirect').addEventListener('click', () => vscode.postMessage({ type: 'copyOAuthRedirect' }));
                document.getElementById('oauth-cancel-token').addEventListener('click', () => {
                    if (!oauthPending) { return; }
                    // Invalidate queued results immediately, before the host receives cancellation.
                    oauthRequestId++;
                    oauthPending = false;
                    oauthGetToken.disabled = false;
                    oauthStatus.textContent = 'Token request cancelled.';
                    vscode.postMessage({ type: 'cancelOAuthToken' });
                });
                const oauthCancelObserver = new MutationObserver(() => {
                    document.getElementById('oauth-cancel-token').disabled = !oauthPending;
                });
                oauthCancelObserver.observe(oauthGetToken, { attributes: true, attributeFilter: ['disabled'] });
                oauthGetToken.addEventListener('click', () => {
                    if (oauthPending || authorizationType.value !== 'oauth2') { return; }
                    oauthPending = true;
                    oauthGetToken.disabled = true;
                    oauthStatus.textContent = oauthGrantType.value === 'authorization_code' ? 'Complete authorization in your browser…' : 'Getting access token…';
                    vscode.postMessage({
                        type: 'getOAuthToken', requestId: ++oauthRequestId,
                        storeAccessToken: oauthStoreToken.checked,
                        accessTokenVariable: oauthTokenVariable.value.trim(),
                        url: document.getElementById('oauth-url').value,
                        clientId: document.getElementById('oauth-client-id').value,
                        clientSecret: document.getElementById('oauth-client-secret').value,
                        scope: document.getElementById('oauth-scope').value,
                        grantType: oauthGrantType.value,
                        authorizationUrl: document.getElementById('oauth-authorization-url').value,
                        clientAuthentication: document.getElementById('oauth-client-authentication').value,
                        state: document.getElementById('oauth-state').value,
                        usePkce: document.getElementById('oauth-pkce').checked,
                    });
                });

				const bearerToken = document.getElementById('bearer-token');
				const bearerAuthorizationFields = Array.from(document.querySelectorAll('.bearer-authorization-field'));
				const basicAuthUsername = document.getElementById('basic-auth-username');
				const basicAuthPassword = document.getElementById('basic-auth-password');
                const basicPasswordToggle = document.getElementById('basic-password-toggle');
                basicPasswordToggle.addEventListener('click', () => setBasicPasswordVisible(basicAuthPassword.type === 'password'));
				const basicAuthorizationFields = Array.from(document.querySelectorAll('.basic-authorization-field'));
				const requestParamsTable = document.getElementById('request-params-table');
				const requestHeadersTable = document.getElementById('request-headers-table');
				const addRequestParam = document.getElementById('add-request-param');
				const addRequestHeader = document.getElementById('add-request-header');
				const requestBodyEditor = document.getElementById('request-body-editor');
				const requestBodyForm = document.getElementById('request-body-form');
				const requestBodyFormTable = document.getElementById('request-body-form-table');
				const addRequestBodyFormRow = document.getElementById('add-request-body-form-row');
				const requestBodyType = document.getElementById('request-body-type');
				const requestBodyBeautify = document.getElementById('request-body-beautify');
				const requestBodyMessage = document.getElementById('request-body-message');
				const requestBodyHighlight = document.getElementById('request-body-highlight');
				const requestBodyLines = document.getElementById('request-body-lines');
				const requestBody = document.getElementById('request-body');
				const bodyTab = document.getElementById('body-tab');
				const headersTab = document.getElementById('headers-tab');
				const rawTab = document.getElementById('raw-tab');
				const previewTab = document.getElementById('preview-tab');
			const bodyPanel = document.getElementById('body-panel');
			const headersPanel = document.getElementById('headers-panel');
			const rawPanel = document.getElementById('raw-panel');
			const previewPanel = document.getElementById('preview-panel');
			const responseStatus = document.getElementById('response-status');
			const responseTime = document.getElementById('response-time');
			const responseSize = document.getElementById('response-size');
			const responseHeaders = document.getElementById('response-headers');
			const responseRawContent = document.getElementById('response-raw-content');
			const responseRawLines = document.getElementById('response-raw-lines');
			const responseRaw = document.getElementById('response-raw');
			const responsePreview = document.getElementById('response-preview');
			const responsePreviewEmpty = document.getElementById('response-preview-empty');
			const footerRepositoryLink = document.getElementById('footer-repository-link');
			const footerIssuesLink = document.getElementById('footer-issues-link');
			const footerLogButton = document.getElementById('footer-log-button');
			const footerHistoryButton = document.getElementById('footer-history-button');
            const footerXLink = document.getElementById('footer-x-link');
			const footerSettingsButton = document.getElementById('footer-settings-button');
			const editorFooter = document.querySelector('.editor-footer');
				const responseBodyContent = document.getElementById('response-body-content');
				const responseBodyLines = document.getElementById('response-body-lines');
				const responseBody = document.getElementById('response-body');
				const streamEvents = document.getElementById('stream-events');
				const streamEventList = document.getElementById('stream-event-list');
				let streamParser;
				let streamBody = '';
				let streamCount = 0;
				let streamExpanded = true;
				const createEventStreamParser = ${createEventStreamParser.toString()};
				for (const [id, expanded] of [['stream-expand', true], ['stream-collapse', false]]) {
					document.getElementById(id).addEventListener('click', () => {
						streamExpanded = expanded;
						for (const card of streamEventList.children) { card.open = expanded; }
					});
				}
				let requestStartedAt = 0;
				let requestTimer = undefined;
				let latestRequestUrl = '';
				let hoveredEnvironmentVariable = '';
				let environmentVariableRequestId = 0;
				let environmentCheckRequestId = 0;
				let environmentCheckTimer;
				let environmentCheckNames = [];
				let environmentValueTooltipEnabled = false;
				let workspaceTrusted = false;
				const missingEnvironmentVariables = new Set();
				let textMeasureContext;
				let activeAuthorizationType = 'none';
				let activeRequestBodyType = 'raw';
				renderRequestParamsFromUrl();
				renderRequestHeaders({});
				updateResponseAreaBounds();
				window.addEventListener('resize', updateResponseAreaBounds);

				document.addEventListener('pointermove', showHoveredEnvironmentVariable);
				document.addEventListener('input', scheduleEnvironmentVariableCheck);
				window.addEventListener('blur', clearHoveredEnvironmentVariable);
				window.addEventListener('pointerleave', clearHoveredEnvironmentVariable);

				footerRepositoryLink.addEventListener('click', () => {
					vscode.postMessage({
						type: 'openRepository',
					});
				});

				footerXLink.addEventListener('click', () => vscode.postMessage({ type: 'openXProfile' }));

				footerIssuesLink.addEventListener('click', () => {
					vscode.postMessage({
						type: 'openIssues',
					});
				});

				footerLogButton.addEventListener('click', () => {
                    vscode.postMessage({ type: 'openNetworkLog' });
                });

				footerHistoryButton.addEventListener('click', () => {
					vscode.postMessage({ type: 'openNetworkHistory' });
				});

				footerSettingsButton.addEventListener('click', () => {
					vscode.postMessage({
						type: 'openSettings',
					});
				});

				requestTitleContainer.addEventListener('click', (event) => {
					if (event.target === requestTitleInput) {
						return;
					}

					startTitleEdit();
				});

				requestTitleInput.addEventListener('keydown', (event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						commitTitleEdit();
					}

					if (event.key === 'Escape') {
						event.preventDefault();
						cancelTitleEdit();
					}
				});

				requestTitleInput.addEventListener('blur', () => {
					commitTitleEdit();
				});

				requestParamsTab.addEventListener('click', () => {
					showRequestTab('params');
				});

				requestAuthorizationTab.addEventListener('click', () => {
                    if (requestAuthorizationTab.getAttribute('aria-selected') !== 'true') {
                        showOAuthTokenView(defaultTokenView);
                    }
					showRequestTab('authorization');
                    refreshConfiguredOAuthToken();
                    updateOAuthTokenDisplay();
				});

				requestHeadersTab.addEventListener('click', () => {
					showRequestTab('headers');
				});

				requestBodyTab.addEventListener('click', () => {
					showRequestTab('body');
				});

				requestBodyType.addEventListener('change', () => {
					clearRequestBodyMessage();
					activeRequestBodyType = requestBodyType.value;
					applyRequestBodyType(requestBodyType.value);
					setRequestBodyContent('');
					renderRequestBodyFormRows('');
					updateResponseAreaBounds();
					notifyRequestChanged();
				});

				authorizationType.addEventListener('change', () => {
                    vscode.postMessage({ type: 'cancelOAuthToken' });
                    oauthRequestId++;
                    oauthPending = false;
                    oauthGetToken.disabled = false;
                    oauthStatus.textContent = '';
					applyAuthorizationType();
					syncAuthorizationHeader();
					notifyRequestChanged();
				});

				bearerToken.addEventListener('input', () => {
					updateSecretReferenceState(bearerToken);
					syncAuthorizationHeader();
					notifyRequestChanged();
				});

				basicAuthUsername.addEventListener('input', () => {
					updateSecretReferenceState(basicAuthUsername);
					syncAuthorizationHeader();
					notifyRequestChanged();
				});

				basicAuthPassword.addEventListener('input', () => {
					updateSecretReferenceState(basicAuthPassword);
					syncAuthorizationHeader();
					notifyRequestChanged();
				});

				addRequestParam.addEventListener('click', () => {
					addRequestParamRow('', '');
					updateResponseAreaBounds();
				});

				addRequestHeader.addEventListener('click', () => {
					addRequestHeaderRow('', '');
					updateResponseAreaBounds();
				});

				addRequestBodyFormRow.addEventListener('click', () => {
					addBodyFormRow('', '');
					updateResponseAreaBounds();
				});

				requestBodyBeautify.addEventListener('click', () => {
					beautifyJsonRequestBody();
				});

				method.addEventListener('change', () => {
					notifyRequestChanged();
				});

				url.addEventListener('input', () => {
					updateSecretReferenceState(url);
					renderRequestParamsFromUrl();
					notifyRequestChanged();
				});

				requestBody.addEventListener('input', () => {
					clearRequestBodyMessage();
					updateSecretReferenceState(requestBody);
					updateRequestBodyLineNumbers();
					updateRequestBodyHighlight();
					notifyRequestChanged();
				});

				requestBody.addEventListener('scroll', () => {
					requestBodyLines.scrollTop = requestBody.scrollTop;
					requestBodyHighlight.scrollTop = requestBody.scrollTop;
					clearHoverLine(requestBodyEditor);
				});

				requestBody.addEventListener('mousemove', (event) => {
					updateTextareaHoverLine(requestBodyEditor, requestBody, event);
				});

				requestBody.addEventListener('mouseleave', () => {
					clearHoverLine(requestBodyEditor);
				});

			bodyTab.addEventListener('click', () => {
				showResponseTab('body');
			});

			headersTab.addEventListener('click', () => {
				showResponseTab('headers');
			});

			rawTab.addEventListener('click', () => {
				showResponseTab('raw');
			});

			previewTab.addEventListener('click', () => {
				showResponseTab('preview');
			});

				responseBodyContent.addEventListener('mousemove', (event) => {
					if (!streamParser) { updateScrollablePreHoverLine(responseBodyContent, responseBody, event); }
				});

				responseBodyContent.addEventListener('mouseleave', () => {
					clearHoverLine(responseBodyContent);
				});

			responseBodyContent.addEventListener('scroll', () => {
				clearHoverLine(responseBodyContent);
			});

				responseRawContent.addEventListener('mousemove', (event) => {
					updateScrollablePreHoverLine(responseRawContent, responseRaw, event);
				});

				responseRawContent.addEventListener('mouseleave', () => {
					clearHoverLine(responseRawContent);
				});

				responseRawContent.addEventListener('scroll', () => {
					clearHoverLine(responseRawContent);
				});

            // Wait for the existing token result handler to update output and header rows.
            function authorizeForSend() {
                return new Promise(resolve => {
                    const requestId = oauthPending ? oauthRequestId : oauthRequestId + 1;
                    oauthSendWaiter = { requestId, resolve };
                    if (!oauthPending) { oauthGetToken.click(); }
                });
            }

            function completeOAuthBeforeSend(message, error) {
                if (oauthSendWaiter?.requestId !== message.requestId) { return; }
                const waiter = oauthSendWaiter;
                oauthSendWaiter = undefined;
                waiter.resolve(error);
            }

            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                if (authorizationBeforeSendPending) {
                    document.getElementById('oauth-cancel-token').click();
                    return;
                }
                if (!requestInProgress && authorizeBeforeSend.checked && authorizationType.value === 'oauth2') {
                    authorizationBeforeSendPending = true;
                    send.textContent = 'Cancel';
                    send.classList.add('request-cancel');
                    setResponseStatus('Authorizing…');
                    const error = await authorizeForSend();
                    authorizationBeforeSendPending = false;
                    send.innerHTML = buttonIcons.send + '<span>Send</span>';
                    send.classList.remove('request-cancel');
                    send.disabled = !workspaceTrusted;
                    if (error || !workspaceTrusted) {
                        setResponseStatus(error || 'Sending requests requires a trusted workspace.', error && error.includes('cancelled') ? '' : 'error');
                        return;
                    }
                }
				if (requestInProgress) {
					send.disabled = true;
					setResponseStatus('Cancelling...');
					vscode.postMessage({ type: 'cancelRequest', requestId: activeRequestId });
					return;
				}
				latestRequestUrl = readEnabledRequestUrl();
				activeRequestId += 1;
				requestInProgress = true;
				send.disabled = false;
				send.textContent = 'Cancel';
				send.classList.add('request-cancel');
				startRequestTimer();
				setResponseStatus('Sending...');
				responseSize.textContent = '';
				responseHeaders.textContent = '(none)';
				setRawContent('(empty)');
				setBodyContent('(empty)');
				setPreviewContent('', false);

			vscode.postMessage({
						type: 'sendRequest',
                        automation: readAutomation(),
					requestId: activeRequestId,
						method: method.value,
						url: latestRequestUrl,
						headers: readEnabledRequestHeaders(),
						body: readRequestBodyForSend(),
					});
		});

		window.addEventListener('message', (event) => {
			const message = event.data;
                if (message.type === 'oauthRedirect') {
                        document.getElementById('oauth-redirect-url').value = message.url || '';
                        document.getElementById('oauth-redirect-url').placeholder = message.error || 'Callback URL unavailable';
                        document.getElementById('oauth-copy-redirect').disabled = !message.url;
                        return;
                    }
                if (message.type === 'autoGenerateStateSetting') {
                    autoGenerateAuthorizationCodeState = message.value === true;
                    return;
                }
                    if (message.type === 'tokenViewSetting') {
                    defaultTokenView = ['raw', 'decoded', 'hidden'].includes(message.value) ? message.value : 'raw';
                    return;
                }
                if (message.type === 'configuredOAuthToken') {
                    if (message.requestId !== configuredOAuthTokenRequestId) { return; }
                    displayedOAuthToken = typeof message.token === 'string' ? message.token : '';
                    oauthStatus.textContent = typeof message.error === 'string' ? formatConfiguredOAuthError(message.error) : '';
                    updateOAuthTokenDisplay();
                    return;
                }
                if (message.type === 'environmentFileSelected') {
                    if (message.requestId !== environmentSelectionRequestId || !requestEnvManual.checked) { return; }
                    if (typeof message.error === 'string') { requestEnvError.textContent = message.error; return; }
                    if (typeof message.path !== 'string') { return; }
                    vscode.postMessage({ type: 'cancelOAuthToken' });
                    oauthRequestId++;
                    oauthPending = false;
                    oauthGetToken.disabled = false;
                    manualEnvironmentPath = message.path;
                    notifyRequestChanged();
                    refreshEnvironmentFile();
                    refreshConfiguredOAuthToken();
                    updateOAuthTokenDisplay();
                    scheduleEnvironmentVariableCheck();
                    return;
                }
                if (message.type === 'environmentFile') {
                    if (message.requestId !== environmentFileRequestId) { return; }
                    requestEnvPath.value = typeof message.path === 'string' ? message.path : '';
                    requestEnvOpen.disabled = !requestEnvPath.value;
                    requestEnvError.textContent = typeof message.error === 'string' ? message.error : '';
                    updateRequestTabIndicators();
                    return;
                }

				if (message.type === 'oauthTokenResult') {
                    if (message.requestId !== oauthRequestId) {
                        completeOAuthBeforeSend(message, 'Token request cancelled.');
                        return;
                    }
                    oauthPending = false;
                    oauthGetToken.disabled = false;
                    oauthStatus.textContent = message.error || (message.stored ? 'Access token saved to .env.' : 'Access token ready.');
                    if (message.stored) { refreshEnvironmentFile(); }
                    if (typeof message.token === 'string' && authorizationType.value === 'oauth2') {
                        displayedOAuthToken = message.token;
                        configuredOAuthTokenRequestId++;
                        if (oauthUpdateHeader.checked) {
                            oauthToken = message.token;
                            applyRetrievedOAuthHeader(message.token);
                            updateOAuthTokenDisplay();
                        } else {
                            updateOAuthTokenDisplay();
                        }
                        notifyRequestChanged();
                    }
                    completeOAuthBeforeSend(message, message.error || (typeof message.token === 'string' ? '' : 'Unable to get an access token.'));
                    return;
                }
                if (message.type === 'requestStream') {
					if (message.requestId !== activeRequestId || !requestInProgress) { return; }
					if (!streamParser) { beginEventStream(); }
					streamBody += message.update.chunk;
					streamParser(message.update.chunk);
					setRawContent(streamBody || '(empty)');
					responseSize.textContent = formatResponseSize(streamBody);
					renderResponseHeaders(message.update.headers);
					setResponseStatus('Streaming: ' + message.update.status + ' ' + message.update.statusText);
					return;
				}
                if (message.type === 'requestComplete') {
				if (message.requestId !== undefined && message.requestId !== activeRequestId) { return; }
				requestInProgress = false;
				send.innerHTML = buttonIcons.send + '<span>Send</span>';
				send.classList.remove('request-cancel');
				send.disabled = !workspaceTrusted;
				stopRequestTimer();
				renderResponse(message.response);
				updateResponseAreaBounds();
				return;
			}

				if (message.type === 'requestError') {
				if (message.requestId !== undefined && message.requestId !== activeRequestId) { return; }
				requestInProgress = false;
				send.innerHTML = buttonIcons.send + '<span>Send</span>';
				send.classList.remove('request-cancel');
				send.disabled = !workspaceTrusted;
					stopRequestTimer();
				setResponseStatus(message.cancelled ? 'Request cancelled' : (message.message || 'Request failed'), message.cancelled ? '' : 'error');
					if (!streamParser) {
						responseSize.textContent = '';
						responseHeaders.textContent = '(none)';
						setRawContent(message.message);
						setBodyContent(message.message);
						setPreviewContent('', false);
					} else {
						streamParser('', true);
					}
					updateResponseAreaBounds();
					return;
				}

				if (message.type === 'workspaceTrust') {
					workspaceTrusted = message.isTrusted === true;
					send.disabled = requestInProgress ? send.disabled : !message.isTrusted;
					send.title = message.isTrusted ? '' : 'Sending requests requires a trusted workspace.';
					if (message.isTrusted) {
						scheduleEnvironmentVariableCheck();
					} else {
						missingEnvironmentVariables.clear();
						refreshVariableHighlights();
					}
					return;
				}

				if (message.type === 'environmentTooltipSetting') {
					environmentValueTooltipEnabled = message.isEnabled === true;
					if (!environmentValueTooltipEnabled) {
						clearHoveredEnvironmentVariable();
						missingEnvironmentVariables.clear();
						refreshVariableHighlights();
					} else {
						scheduleEnvironmentVariableCheck();
					}
					return;
				}

				if (message.type === 'environmentVariablesChecked') {
					if (message.requestId !== environmentCheckRequestId || !Array.isArray(message.definedNames)) {
						return;
					}
					if (typeof message.error === 'string') {
						return;
					}
					const definedNames = new Set(message.definedNames);
					missingEnvironmentVariables.clear();
					for (const name of environmentCheckNames) {
						if (!definedNames.has(name)) {
							missingEnvironmentVariables.add(name);
						}
					}
					refreshVariableHighlights();
					return;
				}

				if (message.type === 'environmentVariableResolved') {
					if (message.requestId !== environmentVariableRequestId || message.name !== hoveredEnvironmentVariable) {
						return;
					}

					if (typeof message.error === 'string') {
						environmentVariableTooltip.classList.remove('is-missing');
						environmentVariableTooltip.textContent = message.error;
					} else if (typeof message.value === 'string') {
						missingEnvironmentVariables.delete(message.name);
						environmentVariableTooltip.classList.remove('is-missing');
						environmentVariableTooltip.textContent = message.value;
					} else {
						missingEnvironmentVariables.add(message.name);
						environmentVariableTooltip.classList.add('is-missing');
						environmentVariableTooltip.textContent = '{{' + message.name + '}} is not defined in the sibling .env file.';
					}
					refreshVariableHighlights();
					return;
				}

				if (message.type === 'loadRequest') {
                        automationRows.replaceChildren();
                        (message.request.automation || []).forEach(addAutomationRow);
                        requestDescription.value = message.request.description || '';
                        descriptionExpanded = false;
                        finishDescriptionEdit();
                        environmentSelectionRequestId++;
                        requestEnvManual.checked = message.request.environment?.mode === 'manual';
                        requestEnvNearest.checked = !requestEnvManual.checked;
                        manualEnvironmentPath = message.request.environment?.path || '';
                        requestEnvChoose.classList.toggle('hidden', !requestEnvManual.checked);
                        refreshEnvironmentFile();
						setRequestTitle(message.request.name);
						method.value = message.request.method;
						url.value = message.request.url;
						updateSecretReferenceState(url);
						if (Array.isArray(message.request.params)) {
							renderRequestParams(message.request.params);
							updateUrlFromParams();
						} else {
							renderRequestParamsFromUrl();
						}
						if (Array.isArray(message.request.headerState)) {
							renderRequestHeaderState(message.request.headerState);
						} else {
							renderRequestHeaders(message.request.headers || {});
						}
                        // Loading another request invalidates pending token results and clears old credentials.
                        vscode.postMessage({ type: 'cancelOAuthToken' });
                        oauthRequestId++;
                        oauthPending = false;
                        oauthGetToken.disabled = false;
                        oauthStatus.textContent = '';
                        oauthToken = '';
                    displayedOAuthToken = '';
                        activeAuthorizationType = 'none';
                        setOAuthSecretVisible(false);
                        setBasicPasswordVisible(false);
                        authorizeBeforeSend.checked = message.request.authorizeBeforeSend === true;
                        const savedAuthorization = message.request.authorization;
                        oauthUpdateHeader.checked = savedAuthorization?.updateAuthorizationHeader !== false;
                        oauthStoreToken.checked = savedAuthorization?.storeAccessToken === true;
                        oauthTokenVariable.value = savedAuthorization?.accessTokenVariable ?? 'ACCESS_TOKEN';
                        oauthGrantType.value = savedAuthorization?.grantType || 'client_credentials';
                        document.getElementById('oauth-authorization-url').value = savedAuthorization?.authorizationUrl || '';
                        document.getElementById('oauth-client-authentication').value = savedAuthorization?.clientAuthentication || 'none';
                        document.getElementById('oauth-pkce').checked = savedAuthorization?.usePkce !== false;
                        document.getElementById('oauth-state').value = savedAuthorization?.state || '';
                        document.getElementById('oauth-url').value = savedAuthorization?.accessTokenUrl || '';
                        document.getElementById('oauth-client-id').value = savedAuthorization?.clientId || '';
                        document.getElementById('oauth-client-secret').value = savedAuthorization?.clientSecret || '';
                        document.getElementById('oauth-scope').value = savedAuthorization?.scope || '';
                        const allHeaders = Array.isArray(message.request.headerState)
                            ? Object.fromEntries(message.request.headerState.map(header => [header.name, header.value]))
                            : message.request.headers || {};
                        readAuthorizationFromHeaders(allHeaders);
                        if (savedAuthorization?.type === 'oauth2') {
                            authorizationType.value = 'oauth2';
                            activeAuthorizationType = 'oauth2';
                            const savedHeader = readHeaderValue(allHeaders, 'Authorization');
                            oauthToken = !oauthStoreToken.checked && savedHeader.startsWith('Bearer ')
                                ? savedHeader.slice(7) : '';
                            bearerToken.value = '';
                            applyAuthorizationType();
                            syncAuthorizationHeader();
                            refreshConfiguredOAuthToken();
                        }
						setRequestBodyContent(message.request.body === null || message.request.body === undefined
							? ''
							: formatBody(message.request.body));
						renderRequestBodyFormRows(requestBody.value);
						setRequestBodyType(inferRequestBodyType(message.request.headers || {}, requestBody.value, activeRequestBodyType));
                        updateRequestTabIndicators();
						scheduleEnvironmentVariableCheck();
						updateResponseAreaBounds();
				}
			});

		function showHoveredEnvironmentVariable(event) {
			if (!environmentValueTooltipEnabled) {
				clearHoveredEnvironmentVariable();
				return;
			}

			const target = event.target;
			if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
				|| target.type === 'checkbox' || target.type === 'submit'
				|| !target.closest('.request-bar, .request-panel')) {
				clearHoveredEnvironmentVariable();
				return;
			}

			const value = target.value;
			const rect = target.getBoundingClientRect();
			const style = window.getComputedStyle(target);
			const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
			const paddingTop = Number.parseFloat(style.paddingTop) || 0;
			if (!value) {
				clearHoveredEnvironmentVariable();
				return;
			}

			textMeasureContext ??= document.createElement('canvas').getContext('2d');
			if (!textMeasureContext) {
				clearHoveredEnvironmentVariable();
				return;
			}
			textMeasureContext.font = style.font;
			const pointerX = event.clientX - rect.left - paddingLeft + target.scrollLeft;
			let sourceLine = value;
			let sourceLineStart = 0;
			if (target instanceof HTMLTextAreaElement) {
				const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) || 16;
				const paddingRight = Number.parseFloat(style.paddingRight) || 0;
				const lineWidth = Math.max(1, target.clientWidth - paddingLeft - paddingRight);
				const visualLines = [];
				let sourceOffset = 0;
				for (const hardLine of value.split('\\n')) {
					if (!hardLine) {
						visualLines.push({ text: '', start: sourceOffset });
					} else {
						let rowStart = 0;
						for (let index = 1; index <= hardLine.length; index += 1) {
							if (textMeasureContext.measureText(hardLine.slice(rowStart, index)).width > lineWidth && index - 1 > rowStart) {
								visualLines.push({ text: hardLine.slice(rowStart, index - 1), start: sourceOffset + rowStart });
								rowStart = index - 1;
							}
						}
						visualLines.push({ text: hardLine.slice(rowStart), start: sourceOffset + rowStart });
					}
					sourceOffset += hardLine.length + 1;
				}

				const visualLineIndex = Math.max(0, Math.floor((event.clientY - rect.top - paddingTop + target.scrollTop) / lineHeight));
			const visualLine = visualLines[visualLineIndex];
			if (!visualLine) {
				clearHoveredEnvironmentVariable();
				return;
			}
			sourceLine = visualLine.text;
			sourceLineStart = visualLine.start;
		}

			let characterIndex = 0;
				while (characterIndex < sourceLine.length
				&& textMeasureContext.measureText(sourceLine.slice(0, characterIndex + 1)).width < pointerX) {
				characterIndex += 1;
			}

			const tokenPattern = /\\{\\{([A-Za-z_][A-Za-z0-9_]*)\\}\\}/g;
			let match;
			let variableName = '';
			const sourceCharacterIndex = sourceLineStart + characterIndex;
			while ((match = tokenPattern.exec(value)) !== null) {
				if (sourceCharacterIndex >= match.index && sourceCharacterIndex <= match.index + match[0].length) {
					variableName = match[1];
					break;
				}
			}

			if (!variableName) {
				clearHoveredEnvironmentVariable();
				return;
			}

			environmentVariableTooltip.style.left = Math.max(8, Math.min(event.clientX + 12, window.innerWidth - 488)) + 'px';
			environmentVariableTooltip.style.top = Math.max(8, Math.min(event.clientY + 16, window.innerHeight - 80)) + 'px';
			environmentVariableTooltip.classList.remove('hidden');
			if (variableName !== hoveredEnvironmentVariable) {
				hoveredEnvironmentVariable = variableName;
				environmentVariableRequestId += 1;
					environmentVariableTooltip.classList.remove('is-missing');
				environmentVariableTooltip.textContent = 'Looking up {{' + variableName + '}}…';
				vscode.postMessage({
					type: 'resolveEnvironmentVariable',
					requestId: environmentVariableRequestId,
					name: variableName,
				});
			}
		}

		function clearHoveredEnvironmentVariable() {
			if (hoveredEnvironmentVariable) {
				hoveredEnvironmentVariable = '';
				environmentVariableRequestId += 1;
			}
			environmentVariableTooltip.classList.add('hidden');
			environmentVariableTooltip.classList.remove('is-missing');
		}

		function scheduleEnvironmentVariableCheck() {
			if (!environmentValueTooltipEnabled || !workspaceTrusted) {
				return;
			}
			window.clearTimeout(environmentCheckTimer);
			environmentCheckTimer = window.setTimeout(() => {
				const variableNames = new Set();
				for (const field of document.querySelectorAll('.request-bar input, .request-panel input, .request-panel textarea')) {
					const pattern = /\\{\\{\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*\\}\\}/g;
					let match;
					while ((match = pattern.exec(field.value)) !== null) {
						variableNames.add(match[1]);
					}
				}

				environmentCheckNames = Array.from(variableNames);
				environmentCheckRequestId += 1;
				if (environmentCheckNames.length === 0) {
					missingEnvironmentVariables.clear();
					refreshVariableHighlights();
					return;
				}
				vscode.postMessage({
					type: 'checkEnvironmentVariables',
					requestId: environmentCheckRequestId,
					names: environmentCheckNames,
				});
			}, 120);
		}

		function refreshVariableHighlights() {
			for (const input of document.querySelectorAll('.variable-input-wrapper input')) {
				updateSecretReferenceState(input);
			}
			updateRequestBodyHighlight();
		}

		vscode.postMessage({
			type: 'webviewReady',
		});

				// Renders response metadata, body, headers, raw text, and preview.
				function renderResponse(result) {
					setResponseStatus(
						'Status: ' + result.status + ' ' + result.statusText,
						isSuccessStatus(result.status) ? 'success' : 'error',
					);
					responseSize.textContent = formatResponseSize(result.body || '');
					renderResponseHeaders(result.headers);
					setRawContent(result.body || '(empty)');
					setFormattedBodyContent(result.body || '(empty)', result.headers);
					setPreviewContent(result.body || '', hasHtmlContentType(result.headers));
					updateResponseAreaBounds();
				}

				// Collapses content without discarding field values or request results.
				function toggleRequestSection(button, section, name) {
					const expanded = button.getAttribute('aria-expanded') !== 'true';
					section.classList.toggle('hidden', !expanded);
					button.setAttribute('aria-expanded', String(expanded));
					const label = (expanded ? 'Collapse ' : 'Expand ') + name;
					button.setAttribute('aria-label', label);
					button.title = label;
					updateResponseAreaBounds();
				}

				// Sizes the active response panel to fit above the fixed footer.
				function updateResponseAreaBounds() {
					const activeResponsePanel = readActiveResponsePanel();

					if (!activeResponsePanel || !editorFooter) {
						return;
					}

					const panelTop = activeResponsePanel.getBoundingClientRect().top;
					const footerTop = editorFooter.getBoundingClientRect().top;
					const availableHeight = Math.max(0, Math.floor(footerTop - panelTop - 12));
					const nextHeight = availableHeight + 'px';

					responseBodyContent.style.setProperty('--response-area-max-height', nextHeight);
					responseHeaders.style.setProperty('--response-area-max-height', nextHeight);
					responseRawContent.style.setProperty('--response-area-max-height', nextHeight);
					responsePreview.style.setProperty('--response-area-max-height', nextHeight);
					responsePreviewEmpty.style.setProperty('--response-area-max-height', nextHeight);
				}

				// Returns the currently visible response content element.
				function readActiveResponsePanel() {
					if (!bodyPanel.classList.contains('hidden')) {
						return responseBodyContent;
					}

					if (!rawPanel.classList.contains('hidden')) {
						return responseRawContent;
					}

					if (!headersPanel.classList.contains('hidden')) {
						return responseHeaders;
					}

					if (!previewPanel.classList.contains('hidden')) {
						return responsePreview.classList.contains('hidden') ? responsePreviewEmpty : responsePreview;
					}

					return undefined;
				}

				// Updates the response status text and optional success/error badge.
				function setResponseStatus(text, badgeType) {
					responseStatus.textContent = text;
					responseStatus.className = badgeType
						? 'response-status-badge ' + badgeType
						: 'response-status-text';
				}

				// Detects 2xx HTTP statuses for badge styling.
				function isSuccessStatus(status) {
					return status >= 200 && status < 300;
				}

				// Starts the elapsed-time counter while a request is in flight.
				function startRequestTimer() {
					requestStartedAt = performance.now();
					updateRequestTimer();

					if (requestTimer !== undefined) {
						clearInterval(requestTimer);
					}

					requestTimer = setInterval(updateRequestTimer, 100);
				}

				// Stops the elapsed-time counter after request completion.
				function stopRequestTimer() {
					if (requestTimer !== undefined) {
						clearInterval(requestTimer);
						requestTimer = undefined;
					}

					updateRequestTimer();
				}

				// Writes the current elapsed request time into the response header.
				function updateRequestTimer() {
					responseTime.textContent = formatDuration(performance.now() - requestStartedAt);
				}

				// Positions the hover-line highlight for the editable body textarea.
				function updateTextareaHoverLine(container, textEditor, event) {
					const editorRect = textEditor.getBoundingClientRect();

					if (event.clientY < editorRect.top || event.clientY > editorRect.bottom) {
						clearHoverLine(container);
						return;
					}

					const metrics = getTextMetrics(textEditor);
					const y = event.clientY - editorRect.top + textEditor.scrollTop - metrics.paddingTop;

					if (y < 0) {
						clearHoverLine(container);
						return;
					}

					const lineIndex = Math.floor(y / metrics.lineHeight);
					const top = textEditor.offsetTop + metrics.paddingTop + (lineIndex * metrics.lineHeight) - textEditor.scrollTop;
					setHoverLine(container, top, metrics.lineHeight);
				}

				// Positions the hover-line highlight for scrollable response blocks.
				function updateScrollablePreHoverLine(container, textEditor, event) {
					const editorRect = textEditor.getBoundingClientRect();

					if (event.clientY < editorRect.top || event.clientY > editorRect.bottom) {
						clearHoverLine(container);
						return;
					}

					const metrics = getTextMetrics(textEditor);
					const y = event.clientY - editorRect.top - metrics.paddingTop;

					if (y < 0) {
						clearHoverLine(container);
						return;
					}

					const lineIndex = Math.floor(y / metrics.lineHeight);
					const top = textEditor.offsetTop + metrics.paddingTop + (lineIndex * metrics.lineHeight);
					setHoverLine(container, top, metrics.lineHeight);
				}

				// Applies hover-line CSS variables to a code-like container.
				function setHoverLine(container, top, height) {
					container.style.setProperty('--hover-line-top', top + 'px');
					container.style.setProperty('--hover-line-height', height + 'px');
					container.classList.add('line-hover');
				}

				// Removes the hover-line state from a code-like container.
				function clearHoverLine(container) {
					container.classList.remove('line-hover');
				}

				// Reads text layout metrics used for line hover calculations.
				function getTextMetrics(element) {
					const style = getComputedStyle(element);
					const fontSize = parseFloat(style.fontSize);
					const parsedLineHeight = parseFloat(style.lineHeight);

					return {
						lineHeight: Number.isFinite(parsedLineHeight) ? parsedLineHeight : fontSize * 1.45,
						paddingTop: parseFloat(style.paddingTop) || 0,
					};
				}

				function readEnvironmentSettings() {
					return requestEnvManual.checked ? { mode: 'manual', path: manualEnvironmentPath } : undefined;
				}

				function refreshEnvironmentFile() {
					requestEnvPath.value = '';
					requestEnvOpen.disabled = true;
					requestEnvError.textContent = '';
					vscode.postMessage({ type: 'getEnvironmentFile', requestId: ++environmentFileRequestId, environment: readEnvironmentSettings() });
				}

				// Switches between request configuration tabs.
				function showRequestTab(tabName) {
					const showParams = tabName === 'params';
					const showAuthorization = tabName === 'authorization';
					const showHeaders = tabName === 'headers';
					const showBody = tabName === 'body';
                    const showAutomation = tabName === 'automation';
                    automationTab.classList.toggle('active', showAutomation);
                    automationTab.setAttribute('aria-selected', String(showAutomation));
                    automationPanel.classList.toggle('hidden', !showAutomation);
                    const showSettings = tabName === 'settings';
                    requestSettingsTab.classList.toggle('active', showSettings);
                    requestSettingsTab.setAttribute('aria-selected', String(showSettings));
                    requestSettingsPanel.classList.toggle('hidden', !showSettings);

					requestParamsTab.classList.toggle('active', showParams);
					requestAuthorizationTab.classList.toggle('active', showAuthorization);
					requestHeadersTab.classList.toggle('active', showHeaders);
					requestBodyTab.classList.toggle('active', showBody);
					requestParamsTab.setAttribute('aria-selected', String(showParams));
					requestAuthorizationTab.setAttribute('aria-selected', String(showAuthorization));
					requestHeadersTab.setAttribute('aria-selected', String(showHeaders));
					requestBodyTab.setAttribute('aria-selected', String(showBody));
					requestParamsPanel.classList.toggle('hidden', !showParams);
					requestAuthorizationPanel.classList.toggle('hidden', !showAuthorization);
					requestHeadersPanel.classList.toggle('hidden', !showHeaders);
					requestBodyPanel.classList.toggle('hidden', !showBody);
					updateResponseAreaBounds();
				}

				// Switches between response display tabs.
				function showResponseTab(tabName) {
					const showBody = tabName === 'body';
					const showHeaders = tabName === 'headers';
					const showRaw = tabName === 'raw';
					const showPreview = tabName === 'preview';

				bodyTab.classList.toggle('active', showBody);
				headersTab.classList.toggle('active', showHeaders);
				rawTab.classList.toggle('active', showRaw);
				previewTab.classList.toggle('active', showPreview);
				bodyTab.setAttribute('aria-selected', String(showBody));
				headersTab.setAttribute('aria-selected', String(showHeaders));
				rawTab.setAttribute('aria-selected', String(showRaw));
				previewTab.setAttribute('aria-selected', String(showPreview));
					bodyPanel.classList.toggle('hidden', !showBody);
					headersPanel.classList.toggle('hidden', !showHeaders);
					rawPanel.classList.toggle('hidden', !showRaw);
					previewPanel.classList.toggle('hidden', !showPreview);
					updateResponseAreaBounds();
				}

				// Rebuilds request parameter rows from the current URL query string.
				function renderRequestParamsFromUrl() {
					renderRequestParams(readParamsFromUrl().map(([name, value]) => ({
						name,
						value,
						enabled: true,
					})));
				}

				// Renders the full request parameter table.
				function renderRequestParams(params) {
					requestParamsTable.textContent = '';

					if (params.length === 0) {
						addRequestParamRow('', '');
						return;
					}

					for (const param of params) {
						addParamRow(param.name, param.value, param.enabled);
					}
				}

				// Renders headers as enabled header rows.
				function renderRequestHeaders(headers) {
					renderRequestHeaderState(Object.entries(headers).map(([name, value]) => ({
						name,
						value,
						enabled: true,
					})));
				}

				// Renders header rows with their persisted enabled state.
				function renderRequestHeaderState(headerState) {
					requestHeadersTable.textContent = '';

					if (headerState.length === 0) {
						addRequestHeaderRow('', '');
						return;
					}

					for (const header of headerState) {
						addHeaderRow(header.name, header.value, header.enabled);
					}
				}

				// Adds a new enabled query parameter row.
				function addRequestParamRow(name, value) {
					addParamRow(name, value, true);
				}

				// Adds a new enabled request header row.
				function addRequestHeaderRow(name, value) {
					addHeaderRow(name, value, true);
				}

				// Creates one query parameter row and wires its edit handlers.
				function addParamRow(name, value, enabled) {
					const row = document.createElement('tr');
					const enabledCell = document.createElement('td');
					const nameCell = document.createElement('td');
					const valueCell = document.createElement('td');
					const actionCell = document.createElement('td');
					const enabledInput = document.createElement('input');
					const nameInput = document.createElement('input');
					const valueInput = document.createElement('input');
					const removeButton = document.createElement('button');

					enabledCell.className = 'request-header-enabled-cell';
					enabledInput.className = 'request-header-enabled';
					enabledInput.type = 'checkbox';
					enabledInput.checked = enabled;
					enabledInput.ariaLabel = 'Include param';
					nameInput.className = 'request-header-input';
					nameInput.placeholder = 'Param name';
					nameInput.value = name;
					valueInput.className = 'request-header-input';
					valueInput.placeholder = 'Param value';
					valueInput.value = value;
					updateSecretReferenceState(nameInput);
					updateSecretReferenceState(valueInput);
					removeButton.className = 'request-header-remove';
					removeButton.type = 'button';
					removeButton.ariaLabel = 'Remove param';
					removeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
					updateRequestRowEnabledState(row, enabledInput.checked);

					enabledInput.addEventListener('change', () => {
						updateRequestRowEnabledState(row, enabledInput.checked);
						updateUrlFromParams();
						notifyRequestChanged();
					});
					nameInput.addEventListener('input', () => {
						updateSecretReferenceState(nameInput);
						updateUrlFromParams();
						notifyRequestChanged();
					});
					valueInput.addEventListener('input', () => {
						updateSecretReferenceState(valueInput);
						updateUrlFromParams();
						notifyRequestChanged();
					});
					removeButton.addEventListener('click', () => {
						row.remove();

						if (requestParamsTable.children.length === 0) {
							addParamRow('', '', true);
						}

						updateUrlFromParams();
						notifyRequestChanged();
					});

					enabledCell.append(enabledInput);
					nameCell.append(nameInput);
					valueCell.append(valueInput);
					actionCell.append(removeButton);
					row.append(enabledCell, nameCell, valueCell, actionCell);
					requestParamsTable.append(row);
					updateSecretReferenceState(nameInput);
					updateSecretReferenceState(valueInput);
				}

				// Creates one request header row and wires its edit handlers.
				function addHeaderRow(name, value, enabled) {
					const row = document.createElement('tr');
					const enabledCell = document.createElement('td');
					const nameCell = document.createElement('td');
					const valueCell = document.createElement('td');
					const actionCell = document.createElement('td');
					const enabledInput = document.createElement('input');
					const nameInput = document.createElement('input');
					const valueInput = document.createElement('input');
					const removeButton = document.createElement('button');

					enabledCell.className = 'request-header-enabled-cell';
					enabledInput.className = 'request-header-enabled';
					enabledInput.type = 'checkbox';
					enabledInput.checked = enabled;
					enabledInput.ariaLabel = 'Include header';
					nameInput.className = 'request-header-input';
					nameInput.placeholder = 'Header name';
					nameInput.value = name;
					valueInput.className = 'request-header-input';
					valueInput.placeholder = 'Header value';
					valueInput.value = value;
					updateSecretReferenceState(nameInput);
					updateSecretReferenceState(valueInput);
					removeButton.className = 'request-header-remove';
					removeButton.type = 'button';
					removeButton.ariaLabel = 'Remove header';
					removeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
					updateRequestRowEnabledState(row, enabledInput.checked);

					enabledInput.addEventListener('change', () => {
						updateRequestRowEnabledState(row, enabledInput.checked);
						notifyRequestChanged();
					});
					nameInput.addEventListener('input', () => {
						updateSecretReferenceState(nameInput);
						notifyRequestChanged();
					});
					valueInput.addEventListener('input', () => {
						updateSecretReferenceState(valueInput);
						notifyRequestChanged();
					});
					removeButton.addEventListener('click', () => {
						row.remove();

						if (requestHeadersTable.children.length === 0) {
							addHeaderRow('', '', true);
						}

						notifyRequestChanged();
					});

					enabledCell.append(enabledInput);
					nameCell.append(nameInput);
					valueCell.append(valueInput);
					actionCell.append(removeButton);
					row.append(enabledCell, nameCell, valueCell, actionCell);
					requestHeadersTable.append(row);
					updateSecretReferenceState(nameInput);
					updateSecretReferenceState(valueInput);
				}

				// Renders form URL encoded body pairs from the serialized body.
				function renderRequestBodyFormRows(body) {
					requestBodyFormTable.textContent = '';

					const entries = readBodyFormEntries(body);

					if (entries.length === 0) {
						addBodyFormRow('', '');
						return;
					}

					for (const [name, value] of entries) {
						addBodyFormRow(name, value);
					}
				}

				// Creates one form URL encoded body row and wires its edit handlers.
				function addBodyFormRow(name, value) {
					const row = document.createElement('tr');
					const nameCell = document.createElement('td');
					const valueCell = document.createElement('td');
					const actionCell = document.createElement('td');
					const nameInput = document.createElement('input');
					const valueInput = document.createElement('input');
					const removeButton = document.createElement('button');

					nameInput.className = 'request-header-input';
					nameInput.placeholder = 'Field name';
					nameInput.value = name;
					valueInput.className = 'request-header-input';
					valueInput.placeholder = 'Field value';
					valueInput.value = value;
					updateSecretReferenceState(nameInput);
					updateSecretReferenceState(valueInput);
					removeButton.className = 'request-header-remove';
					removeButton.type = 'button';
					removeButton.ariaLabel = 'Remove form pair';
					removeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';

					nameInput.addEventListener('input', () => {
						updateSecretReferenceState(nameInput);
						syncRequestBodyFromFormRows();
						notifyRequestChanged();
					});
					valueInput.addEventListener('input', () => {
						updateSecretReferenceState(valueInput);
						syncRequestBodyFromFormRows();
						notifyRequestChanged();
					});
					removeButton.addEventListener('click', () => {
						row.remove();

						if (requestBodyFormTable.children.length === 0) {
							addBodyFormRow('', '');
						}

						syncRequestBodyFromFormRows();
						notifyRequestChanged();
					});

					nameCell.append(nameInput);
					valueCell.append(valueInput);
					actionCell.append(removeButton);
					row.append(nameCell, valueCell, actionCell);
					requestBodyFormTable.append(row);
					updateSecretReferenceState(nameInput);
					updateSecretReferenceState(valueInput);
				}

				// Serializes form rows back into the hidden body textarea.
				function syncRequestBodyFromFormRows() {
					requestBody.value = readBodyFormValue();
					updateRequestBodyLineNumbers();
				}

				// Reads form body rows as an application/x-www-form-urlencoded string.
				function readBodyFormValue() {
					const params = new URLSearchParams();

					for (const [name, value] of readBodyFormRows()) {
						params.append(name, value);
					}

					return params.toString();
				}

				// Reads non-empty form body rows from the DOM.
				function readBodyFormRows() {
					const values = [];

					for (const row of requestBodyFormTable.querySelectorAll('tr')) {
						const inputs = row.querySelectorAll('.request-header-input');
						const name = inputs[0].value.trim();

						if (name) {
							values.push([name, inputs[1].value]);
						}
					}

					return values;
				}

				// Parses a serialized form body into editable key/value entries.
				function readBodyFormEntries(body) {
					const entries = [];

					for (const [name, value] of new URLSearchParams(body).entries()) {
						entries.push([name, value]);
					}

					return entries;
				}

				// Reflects an enabled checkbox on a request row's visual state.
				function updateRequestRowEnabledState(row, enabled) {
					row.classList.toggle('request-header-disabled', !enabled);
				}

				// Selects and applies the active body editor mode.
				function setRequestBodyType(nextType) {
					requestBodyType.value = nextType;
					applyRequestBodyType(nextType);
				}

				// Updates body controls and Content-Type header for a body mode.
				function applyRequestBodyType(nextType) {
					const hasTextBody = nextType !== 'none' && nextType !== 'form';
					const hasFormBody = nextType === 'form';

					requestBodyEditor.classList.toggle('hidden', !hasTextBody);
					requestBodyForm.classList.toggle('hidden', !hasFormBody);
					requestBodyBeautify.classList.toggle('hidden', nextType !== 'json');
					requestBodyEditor.classList.toggle('json-highlight', nextType === 'json');
					requestBody.disabled = !hasTextBody;
					requestBody.placeholder = readBodyTypePlaceholder(nextType);
					updateRequestBodyHighlight();

					if (hasFormBody && requestBodyFormTable.children.length === 0) {
						renderRequestBodyFormRows(requestBody.value);
					}

					const contentType = readBodyTypeContentType(nextType);

					if (contentType) {
						setHeaderValue('Content-Type', contentType);
					} else if (nextType === 'none' || nextType === 'raw') {
						removeHeaderValue('Content-Type');
					}
				}

				// Maps a body mode to its default Content-Type value.
				function readBodyTypeContentType(nextType) {
					const contentTypes = {
						json: 'application/json',
						text: 'text/plain',
						xml: 'application/xml',
						html: 'text/html',
						form: 'application/x-www-form-urlencoded',
					};

					return contentTypes[nextType] || '';
				}

				// Initializes authorization controls from an Authorization header.
				function readAuthorizationFromHeaders(headers) {
					const authorization = readHeaderValue(headers, 'Authorization');

					if (authorization.startsWith('Bearer ')) {
						authorizationType.value = activeAuthorizationType === 'oauth2' && authorization === 'Bearer ' + oauthToken ? 'oauth2' : 'bearer';
						activeAuthorizationType = authorizationType.value;
						bearerToken.value = authorization.slice('Bearer '.length);
						basicAuthUsername.value = '';
						basicAuthPassword.value = '';
					} else if (authorization.startsWith('Basic ')) {
						authorizationType.value = 'basic';
						activeAuthorizationType = 'basic';
						bearerToken.value = '';
						readBasicAuthorizationCredentials(authorization.slice('Basic '.length));
					} else {
						authorizationType.value = activeAuthorizationType;
					}

					applyAuthorizationType();
					updateAuthorizationSecretStates();
					syncAuthorizationHeader();
				}

				// Secret visibility is temporary UI state and does not alter the request.
				function setOAuthSecretVisible(visible) {
					oauthClientSecret.type = visible ? 'text' : 'password';
					oauthSecretToggle.innerHTML = (visible ? buttonIcons.eyeClosed : buttonIcons.eye) + '<span>' + (visible ? 'Hide' : 'Show') + '</span>';
					oauthSecretToggle.setAttribute('aria-label', visible ? 'Hide client secret' : 'Show client secret');
					oauthSecretToggle.setAttribute('aria-pressed', String(visible));
				}

				function setBasicPasswordVisible(visible) {
					basicAuthPassword.type = visible ? 'text' : 'password';
					basicPasswordToggle.innerHTML = (visible ? buttonIcons.eyeClosed : buttonIcons.eye) + '<span>' + (visible ? 'Hide' : 'Show') + '</span>';
					basicPasswordToggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
					basicPasswordToggle.setAttribute('aria-pressed', String(visible));
				}

				// Shows the authorization inputs for the selected auth type.
				function applyAuthorizationType() {
					const showBearerToken = authorizationType.value === 'bearer';
					const showBasicAuth = authorizationType.value === 'basic';
                    const showOAuth = authorizationType.value === 'oauth2';
                    ['oauth-url', 'oauth-client-id', 'oauth-client-secret', 'oauth-scope', 'oauth-authorization-url', 'oauth-state'].forEach((id) => {
                        updateSecretReferenceState(document.getElementById(id));
                    });
                    updateOAuthTokenDisplay();
                    document.querySelectorAll('.oauth-storage-field').forEach((field) => setAuthorizationFieldHidden(field, !showOAuth || !oauthStoreToken.checked));
                    document.querySelectorAll('.oauth-authorization-field').forEach((field) => setAuthorizationFieldHidden(field, !showOAuth));
                    document.querySelectorAll('.oauth-client-field').forEach((field) => setAuthorizationFieldHidden(field, !showOAuth));
                    const showCode = showOAuth && oauthGrantType.value === 'authorization_code';
                    document.querySelectorAll('.oauth-code-field').forEach((field) => setAuthorizationFieldHidden(field, !showCode));
                    const hideSecret = showCode && document.getElementById('oauth-client-authentication').value === 'none';
                    document.querySelector('label[for="oauth-client-secret"]').textContent = showCode && document.getElementById('oauth-client-authentication').value === 'body' ? 'Client Secret (optional)' : 'Client Secret';
                    setAuthorizationFieldHidden(document.querySelector('label[for="oauth-client-secret"]'), !showOAuth || hideSecret);
                    setAuthorizationFieldHidden(document.getElementById('oauth-client-secret').closest('.authorization-secret-control'), !showOAuth || hideSecret);
                    oauthGetToken.disabled = oauthPending;
                    if (showCode && !oauthPending) {
                        vscode.postMessage({ type: 'getOAuthRedirect' });
                    }


					bearerAuthorizationFields.forEach((field) => {
						setAuthorizationFieldHidden(field, !showBearerToken);
					});

					basicAuthorizationFields.forEach((field) => {
						setAuthorizationFieldHidden(field, !showBasicAuth);
					});
				}

				function formatConfiguredOAuthError(error) {
					const name = oauthTokenVariable.value.trim();
					if (oauthStoreToken.checked && error === 'Missing environment variable: ' + name) {
						return error + '. It will be created in .env when you get a new access token.';
					}
					return error;
				}

				// This output is separate from header/configuration state and is never persisted.
				function refreshConfiguredOAuthToken() {
					const requestId = ++configuredOAuthTokenRequestId;
					displayedOAuthToken = '';
					oauthStatus.textContent = '';
					if (authorizationType.value !== 'oauth2') { return; }
					const row = !oauthUpdateHeader.checked ? findHeaderRow('Authorization') : undefined;
					const authorization = row ? row.querySelectorAll('.request-header-input')[1].value : readAuthorizationHeaderValue();
					if (!authorization) { return; }
					vscode.postMessage({ type: 'getConfiguredOAuthToken', requestId, authorization });
				}

				// Displays the current OAuth token without treating it as HTML.
				function updateOAuthTokenDisplay() {
					const visible = authorizationType.value === 'oauth2';
					oauthTokenPanel.classList.toggle('hidden', !visible);
					authorizationLayout.classList.toggle('has-oauth-token-panel', visible);
					oauthAccessToken.value = visible ? displayedOAuthToken : '';
                    oauthCopyToken.disabled = !visible || !displayedOAuthToken;
                    const decoded = decodeOAuthToken(oauthAccessToken.value);
                    if (decoded.startsWith('{')) {
                        oauthDecodedToken.innerHTML = formatJsonHighlight(decoded);
                    } else {
                        oauthDecodedToken.textContent = decoded || 'No access token configured.';
                    }
				}

				// Switches token views without changing request authorization.
				function showOAuthTokenView(view) {
					oauthHiddenOption.checked = view === 'hidden';
					oauthRawOption.checked = view === 'raw';
					oauthDecodedOption.checked = view === 'decoded';
					oauthRawPanel.classList.toggle('hidden', view !== 'raw');
					oauthDecodedPanel.classList.toggle('hidden', view !== 'decoded');
                    oauthTokenPanel.classList.toggle('is-token-hidden', view === 'hidden');
				}

				// Decodes locally; JSON is escaped before syntax highlighting and never executed.
				function decodeOAuthToken(token) {
					if (!token) { return ''; }
					const parts = token.split('.');
					if (parts.length !== 3) { return 'This access token is not a readable JWT.'; }
					try {
						const decodePart = (part) => {
							if (!/^[A-Za-z0-9_-]+$/.test(part)) { throw new Error('Invalid JWT encoding'); }
							const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
							const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
							const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
							if (!value || typeof value !== 'object' || Array.isArray(value)) { throw new Error('Invalid JWT JSON'); }
							return value;
						};
						return JSON.stringify({ header: decodePart(parts[0]), payload: decodePart(parts[1]) }, null, 2);
					} catch { return 'Unable to decode this access token. It may be opaque or malformed.'; }
				}

				// Hides or shows an authorization field and its variable wrapper.
				function setAuthorizationFieldHidden(field, hidden) {
					field.classList.toggle('hidden', hidden);

					if (field.parentElement?.classList.contains('variable-input-wrapper')) {
						field.parentElement.classList.toggle('hidden', hidden);
					}
				}

				// Applies OAuth settings only after successful explicit token retrieval.
				function applyRetrievedOAuthHeader(token) {
					const value = oauthStoreToken.checked
						? 'Bearer {{' + oauthTokenVariable.value.trim() + '}}' : 'Bearer ' + token;
					setHeaderValue('Authorization', value);
				}

				// Writes authorization control state back to the header table.
				function syncAuthorizationHeader() {
                    if (authorizationType.value === 'oauth2') {
                        updateOAuthTokenDisplay();
                        return;
                    }
                    refreshConfiguredOAuthToken();
                    updateOAuthTokenDisplay();
					activeAuthorizationType = authorizationType.value;
					const headerValue = readAuthorizationHeaderValue();

					if (headerValue) {
						setHeaderValue('Authorization', readAuthorizationHeaderDisplayValue(headerValue));
						return;
					}

					removeHeaderValue('Authorization');
				}

				// Builds the executable Authorization header value.
				function readAuthorizationHeaderValue() {
					if (authorizationType.value === 'oauth2') {
                        const row = findHeaderRow('Authorization');
                        return row ? row.querySelectorAll('.request-header-input')[1].value : '';
                    }
                    if (authorizationType.value === 'bearer' && bearerToken.value) {
						return 'Bearer ' + bearerToken.value;
					}

					if (authorizationType.value === 'basic' && (basicAuthUsername.value || basicAuthPassword.value)) {
						return 'Basic ' + encodeBase64(basicAuthUsername.value + ':' + basicAuthPassword.value);
					}

					return '';
				}

				// Preserves Bearer references and masks encoded variable-backed Basic credentials.
				function readAuthorizationHeaderDisplayValue(headerValue) {
					if (
						authorizationType.value === 'basic'
						&& (hasVariableReference(basicAuthUsername.value) || hasVariableReference(basicAuthPassword.value))
					) {
						return 'Basic ***';
					}

					return headerValue;
				}

				// Detects RestCraft environment variable placeholders.
				function hasVariableReference(value) {
					return /\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}/.test(value);
				}

				// Highlights variable placeholders without exposing secret values.
				function updateSecretReferenceState(element) {
					if (element === requestBody) {
						requestBodyEditor.classList.toggle(
							'variable-highlight',
							!requestBodyEditor.classList.contains('json-highlight') && hasVariableReference(element.value),
						);
						return;
					}

					const wrapper = readVariableInputWrapper(element);

					if (!wrapper) {
						return;
					}

					const overlay = wrapper.querySelector('.variable-highlight-overlay');
					const hasSecretReference = hasVariableReference(element.value);

					wrapper.classList.toggle('has-secret-reference', hasSecretReference);
					overlay.innerHTML = hasSecretReference ? formatSecretHighlight(element.value) : '';
				}

				// Refreshes variable highlighting for authorization fields.
				function updateAuthorizationSecretStates() {
					updateSecretReferenceState(bearerToken);
					updateSecretReferenceState(basicAuthUsername);
					updateSecretReferenceState(basicAuthPassword);
				}

				// Ensures an input has an overlay wrapper for variable highlighting.
				function readVariableInputWrapper(element) {
					if (element.parentElement?.classList.contains('variable-input-wrapper')) {
						return element.parentElement;
					}

					if (!element.parentElement) {
						return undefined;
					}

					const wrapper = document.createElement('span');
					const overlay = document.createElement('span');

					wrapper.className = 'variable-input-wrapper';
					overlay.className = 'variable-highlight-overlay';
					element.parentElement.insertBefore(wrapper, element);
					wrapper.append(overlay, element);
					wrapper.classList.toggle('hidden', element.classList.contains('hidden'));

					return wrapper;
				}

				// Produces highlighted HTML for variable placeholders.
				function formatSecretHighlight(content) {
					return escapeHtml(content).replace(
						/\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}/g,
					(match) => {
						const variableName = match.match(/[A-Za-z_][A-Za-z0-9_]*/)?.[0];
						const missingClass = variableName && missingEnvironmentVariables.has(variableName) ? ' is-missing' : '';
						return '<span class="secret-reference' + missingClass + '">' + match + '</span>';
					},
					);
				}

				// Decodes a Basic auth header into username/password inputs.
				function readBasicAuthorizationCredentials(encodedCredentials) {
					const credentials = decodeBase64(encodedCredentials);
					const separatorIndex = credentials.indexOf(':');

					if (separatorIndex === -1) {
						basicAuthUsername.value = credentials;
						basicAuthPassword.value = '';
						return;
					}

					basicAuthUsername.value = credentials.slice(0, separatorIndex);
					basicAuthPassword.value = credentials.slice(separatorIndex + 1);
				}

				// Encodes UTF-8 text for browser-side Basic auth.
				function encodeBase64(value) {
					const bytes = new TextEncoder().encode(value);
					let binary = '';

					bytes.forEach((byte) => {
						binary += String.fromCharCode(byte);
					});

					return btoa(binary);
				}

				// Decodes UTF-8 text from browser-side Basic auth.
				function decodeBase64(value) {
					try {
						const binary = atob(value);
						const bytes = new Uint8Array(binary.length);

						for (let i = 0; i < binary.length; i++) {
							bytes[i] = binary.charCodeAt(i);
						}

						return new TextDecoder().decode(bytes);
					} catch {
						return '';
					}
				}

				// Returns placeholder text for the selected body type.
				function readBodyTypePlaceholder(nextType) {
					const placeholders = {
						raw: 'Raw request body',
						json: '{\\n  "example": true\\n}',
						text: 'Plain text request body',
						xml: '<example>true</example>',
						html: '<p>Request body</p>',
					};

					return placeholders[nextType] || '';
				}

				// Infers the body editor mode from headers and current body content.
				function inferRequestBodyType(headers, body, fallbackType) {
					const contentType = readHeaderValue(headers, 'Content-Type').toLowerCase();

					if (contentType.includes('application/json')) {
						return 'json';
					}

					if (contentType.includes('text/plain')) {
						return 'text';
					}

					if (contentType.includes('application/xml') || contentType.includes('text/xml')) {
						return 'xml';
					}

					if (contentType.includes('text/html')) {
						return 'html';
					}

					if (contentType.includes('application/x-www-form-urlencoded')) {
						return 'form';
					}

					if (!body) {
						return fallbackType;
					}

					return 'raw';
				}

				// Reads the request body exactly as it should be sent.
				function readRequestBodyForSend() {
					if (requestBodyType.value === 'none') {
						return '';
					}

					if (requestBodyType.value === 'form') {
						return readBodyFormValue();
					}

					return requestBody.value;
				}

				// Formats the JSON request body or shows a validation message.
				function beautifyJsonRequestBody() {
					try {
						setRequestBodyContent(JSON.stringify(JSON.parse(requestBody.value), null, 2));
						clearRequestBodyMessage();
						notifyRequestChanged();
					} catch {
						setRequestBodyMessage('Invalid JSON body');
					}
				}

				// Shows request body validation feedback.
				function setRequestBodyMessage(message) {
					requestBodyMessage.textContent = message;
					requestBodyMessage.classList.remove('hidden');
				}

				// Clears request body validation feedback.
				function clearRequestBodyMessage() {
					requestBodyMessage.textContent = '';
					requestBodyMessage.classList.add('hidden');
				}

				// Creates or updates a header row by case-insensitive name.
				function setHeaderValue(name, value) {
					let row = findHeaderRow(name);

					if (!row) {
						row = findEmptyHeaderRow();

						if (!row) {
							addHeaderRow(name, value, true);
							return;
						}
					}

					const enabledInput = row.querySelector('.request-header-enabled');
					const inputs = row.querySelectorAll('.request-header-input');
					const enabled = enabledInput.checked;

					inputs[0].value = name;
					inputs[1].value = value;
					updateSecretReferenceState(inputs[0]);
					updateSecretReferenceState(inputs[1]);
					updateRequestRowEnabledState(row, enabled);
				}

				// Removes a header row by case-insensitive name.
				function removeHeaderValue(name) {
					const row = findHeaderRow(name);

					if (row) {
						row.remove();
					}

					if (requestHeadersTable.children.length === 0) {
						addHeaderRow('', '', true);
					}
				}

				// Finds a header row by case-insensitive name.
				function findHeaderRow(name) {
					const normalizedName = name.toLowerCase();

					for (const row of requestHeadersTable.querySelectorAll('tr')) {
						const inputs = row.querySelectorAll('.request-header-input');

						if (inputs[0].value.trim().toLowerCase() === normalizedName) {
							return row;
						}
					}

					return undefined;
				}

				// Finds a blank header row that can be reused.
				function findEmptyHeaderRow() {
					for (const row of requestHeadersTable.querySelectorAll('tr')) {
						const inputs = row.querySelectorAll('.request-header-input');

						if (!inputs[0].value.trim() && !inputs[1].value) {
							return row;
						}
					}

					return undefined;
				}

				// Reads a header value by case-insensitive name from an object map.
				function readHeaderValue(headers, name) {
					const normalizedName = name.toLowerCase();

					for (const [headerName, value] of Object.entries(headers)) {
						if (headerName.toLowerCase() === normalizedName) {
							return value;
						}
					}

					return '';
				}

				// Reads all request headers from the editor rows.
				function readRequestHeaders() {
					const headers = readHeaderRows(false);
					return persistedOAuthHeaders(headers);
				}

				// Reads header rows including enabled/disabled state for persistence.
				function readRequestHeaderState() {
					const values = [];

					for (const row of requestHeadersTable.querySelectorAll('tr')) {
						const enabledInput = row.querySelector('.request-header-enabled');
						const inputs = row.querySelectorAll('.request-header-input');
						const name = inputs[0].value.trim();

						if (name) {
							values.push({
								name,
								value: readHeaderRowValue(name, inputs[1].value),
								enabled: enabledInput.checked,
							});
						}
					}

                    return values;
                }

                // Persists a literal token unless environment storage is enabled.
                function persistedOAuthHeaders(headers) {
                    return headers;
                }

				// Reads only enabled headers for request execution.
				function readEnabledRequestHeaders() {
					return readHeaderRows(true);
				}

				// Reads header rows, optionally filtering to enabled rows.
				function readHeaderRows(onlyEnabled) {
					const values = {};

					for (const row of requestHeadersTable.querySelectorAll('tr')) {
						const enabledInput = row.querySelector('.request-header-enabled');
						const inputs = row.querySelectorAll('.request-header-input');
						const name = inputs[0].value.trim();

						if ((!onlyEnabled || enabledInput.checked) && name) {
							values[name] = readHeaderRowValue(name, inputs[1].value);
						}
					}

					return values;
				}

				// Returns the executable value for a header row.
				function readHeaderRowValue(name, value) {
					if (name.toLowerCase() === 'authorization') {
						return readAuthorizationHeaderValue() || value;
					}

					return value;
				}

				// Reads query parameter rows including enabled/disabled state.
				function readRequestParamState() {
					const values = [];

					for (const row of requestParamsTable.querySelectorAll('tr')) {
						const enabledInput = row.querySelector('.request-header-enabled');
						const inputs = row.querySelectorAll('.request-header-input');
						const name = inputs[0].value.trim();

						if (name) {
							values.push({
								name,
								value: inputs[1].value,
								enabled: enabledInput.checked,
							});
						}
					}

					return values;
				}

				// Builds the executable URL using only enabled query parameters.
				function readEnabledRequestUrl() {
					let parsed;
					try {
						parsed = new URL(url.value);
					} catch {
						return url.value;
					}

					parsed.search = '';

					for (const [name, value] of readParamRows(true)) {
						parsed.searchParams.append(name, value);
					}

					return parsed.toString();
				}

				// Reads query parameter rows, optionally filtering to enabled rows.
				function readParamRows(onlyEnabled) {
					const values = [];

					for (const row of requestParamsTable.querySelectorAll('tr')) {
						const enabledInput = row.querySelector('.request-header-enabled');
						const inputs = row.querySelectorAll('.request-header-input');
						const name = inputs[0].value.trim();

						if ((!onlyEnabled || enabledInput.checked) && name) {
							values.push([name, inputs[1].value]);
						}
					}

					return values;
				}

				// Parses query parameters from the current URL input.
				function readParamsFromUrl() {
					try {
						return Array.from(new URL(url.value).searchParams.entries());
					} catch {
						return [];
					}
				}

				// Rewrites the URL query string from enabled parameter rows.
				function updateUrlFromParams() {
					let parsed;
					try {
						parsed = new URL(url.value);
					} catch {
						return;
					}

					parsed.search = '';

					for (const [name, value] of readParamRows(true)) {
						parsed.searchParams.append(name, value);
					}

					url.value = parsed.toString();
				}

				// Marks sections with values, including partial and disabled rows.
				function updateRequestTabIndicators() {
					const hasRowValues = table => Array.from(table.querySelectorAll('.request-header-input')).some(input => input.value.trim());
					const countRows = table => Array.from(table.querySelectorAll('tr')).filter(row => hasRowValues(row)).length;
					const paramCount = countRows(requestParamsTable);
					const headerCount = countRows(requestHeadersTable);
					const automationCount = countRows(automationRows);
					const states = [
						[requestParamsTab, paramCount > 0, paramCount],
						[requestAuthorizationTab, authorizationType.value !== 'none'],
						[requestHeadersTab, headerCount > 0, headerCount],
						[automationTab, automationCount > 0, automationCount],
						[requestBodyTab, Boolean(requestBody.value.trim()) || hasRowValues(requestBodyFormTable)],
						[requestSettingsTab, authorizeBeforeSend.checked || (requestEnvManual.checked && Boolean(manualEnvironmentPath.trim()))],
					];
					for (const [tab, hasValues, count] of states) {
						const counter = tab.querySelector('.request-tab-count');
						if (counter) {
							counter.textContent = count > 0 ? String(count) : '';
							counter.hidden = count === 0;
						}
						tab.classList.toggle('has-values', Boolean(hasValues));
						tab.setAttribute('aria-label', tab.textContent.trim() + (hasValues ? ', contains values' : ''));
					}
				}

				// Posts the current editor state to the extension host for syncing.
				function notifyRequestChanged() {
                    updateRequestTabIndicators();
					vscode.postMessage({
						type: 'requestChanged',
                        automation: readAutomation(),
                        description: requestDescription.value,
                        authorizeBeforeSend: authorizeBeforeSend.checked,
                        environment: readEnvironmentSettings(),
                        authorization: authorizationType.value === 'oauth2' ? {
                            type: 'oauth2', grantType: oauthGrantType.value,
                            accessTokenUrl: document.getElementById('oauth-url').value,
                            clientId: document.getElementById('oauth-client-id').value,
                            clientSecret: document.getElementById('oauth-client-secret').value,
                            scope: document.getElementById('oauth-scope').value,
                            authorizationUrl: document.getElementById('oauth-authorization-url').value,
                            clientAuthentication: document.getElementById('oauth-client-authentication').value,
                            usePkce: document.getElementById('oauth-pkce').checked,
                            state: document.getElementById('oauth-state').value,
                            updateAuthorizationHeader: oauthUpdateHeader.checked,
                            storeAccessToken: oauthStoreToken.checked,
                            accessTokenVariable: oauthTokenVariable.value.trim(),
                        } : undefined,
						name: requestTitle.textContent || 'Untitled Request',
						method: method.value,
						url: url.value,
						params: readRequestParamState(),
						headerState: readRequestHeaderState(),
						headers: readRequestHeaders(),
						body: readRequestBodyForSend(),
					});
				}

				function renderDescription() {
					const lines = requestDescription.value.split(/\\r?\\n/);
					const preview = lines[0] + (lines.length > 1 ? '...' : '');
					requestDescriptionText.textContent = (descriptionExpanded ? requestDescription.value : preview) || 'Add description…';
					descriptionDisplay.classList.toggle('expanded', descriptionExpanded);
					requestDescriptionToggle.textContent = descriptionExpanded ? 'Show less ▴' : 'Show more ▾';
					requestDescriptionToggle.setAttribute('aria-expanded', String(descriptionExpanded));
					requestAnimationFrame(() => {
						const overflow = descriptionExpanded || lines.length > 1
							|| requestDescriptionText.scrollWidth > requestDescriptionText.clientWidth;
						requestDescriptionToggle.classList.toggle('hidden', !requestDescription.value.trim() || !overflow);
						updateResponseAreaBounds();
					});
				}

				function startDescriptionEdit() {
					descriptionDisplay.classList.add('hidden');
					requestDescription.classList.remove('hidden');
					requestDescription.focus();
					updateResponseAreaBounds();
				}

				function finishDescriptionEdit() {
					requestDescription.classList.add('hidden');
					descriptionDisplay.classList.remove('hidden');
					renderDescription();
				}

				// Normalizes and renders the request title.
				function setRequestTitle(value) {
					const title = value.trim() || 'Untitled Request';

					requestTitle.textContent = title;
					requestTitleInput.value = title;
				}

				// Enters inline request title editing mode.
				function startTitleEdit() {
					requestTitleInput.value = requestTitle.textContent || '';
					requestTitle.classList.add('hidden');
					requestTitleInput.classList.remove('hidden');
					requestTitleInput.focus();
					requestTitleInput.select();
				}

				// Saves inline request title edits.
				function commitTitleEdit() {
					if (requestTitleInput.classList.contains('hidden')) {
						return;
					}

					setRequestTitle(requestTitleInput.value);
					requestTitleInput.classList.add('hidden');
					requestTitle.classList.remove('hidden');
					notifyRequestChanged();
				}

				// Discards inline request title edits.
				function cancelTitleEdit() {
					requestTitleInput.value = requestTitle.textContent || '';
					requestTitleInput.classList.add('hidden');
					requestTitle.classList.remove('hidden');
				}

				// Sets request body text and refreshes editor adornments.
				function setRequestBodyContent(content) {
					requestBody.value = content;
					updateSecretReferenceState(requestBody);
					updateRequestBodyLineNumbers();
					updateRequestBodyHighlight();
				}

				// Syncs line numbers with the request body textarea.
				function updateRequestBodyLineNumbers() {
					requestBodyLines.textContent = formatLineNumbers(requestBody.value || ' ');
				}

				// Refreshes JSON or variable highlighting for the request body.
				function updateRequestBodyHighlight() {
					requestBodyEditor.classList.remove('variable-highlight');

					if (!requestBodyEditor.classList.contains('json-highlight')) {
						if (hasVariableReference(requestBody.value)) {
							requestBodyEditor.classList.add('variable-highlight');
							requestBodyHighlight.innerHTML = formatSecretHighlight(requestBody.value || ' ');
						} else {
							requestBodyHighlight.textContent = '';
						}

						return;
					}

					requestBodyHighlight.innerHTML = formatJsonHighlight(requestBody.value || ' ');
					requestBodyHighlight.scrollTop = requestBody.scrollTop;
				}

				// Converts JSON-like text into escaped syntax-highlighted HTML.
				function formatJsonHighlight(content) {
					const tokenPattern = /("(?:\\\\.|[^"\\\\])*"\\s*:?)|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?/g;
					let result = '';
					let lastIndex = 0;
					let match = tokenPattern.exec(content);

					while (match) {
						const token = match[0];
						const className = readJsonTokenClass(token);

						result += escapeHtml(content.slice(lastIndex, match.index));
						result += '<span class="' + className + '">' + escapeHtml(token) + '</span>';
						lastIndex = match.index + token.length;
						match = tokenPattern.exec(content);
					}

					result += escapeHtml(content.slice(lastIndex));

					return result;
				}

				// Chooses the highlight class for one JSON token.
				function readJsonTokenClass(token) {
					if (token.startsWith('"')) {
						return token.trimEnd().endsWith(':') ? 'json-token-key' : 'json-token-string';
					}

					if (token === 'true' || token === 'false' || token === 'null') {
						return 'json-token-literal';
					}

					return 'json-token-number';
				}

				// Escapes text before inserting it as HTML.
				function escapeHtml(content) {
					return content
						.replace(/&/g, '&amp;')
						.replace(/</g, '&lt;')
						.replace(/>/g, '&gt;');
				}

			// Sets formatted response body text and line numbers.
			function setBodyContent(content, highlightJson) {
				streamParser = undefined;
				streamBody = '';
				streamEvents.classList.add('hidden');
				responseBodyContent.classList.remove('events-mode');
				streamEventList.replaceChildren();
				if (highlightJson) {
					responseBody.innerHTML = formatJsonHighlight(content);
				} else {
					responseBody.textContent = content;
				}

				responseBodyLines.textContent = formatLineNumbers(content);
			}

			// Sets raw response body text and line numbers.
			function setRawContent(content) {
				responseRaw.textContent = content;
				responseRawLines.textContent = formatLineNumbers(content);
			}

			// Formats and renders response body content based on headers.
			function setFormattedBodyContent(content, headers) {
				if (readHeaderValue(headers, 'Content-Type').split(';')[0].trim().toLowerCase() === 'text/event-stream') {
					if (!streamParser) {
						beginEventStream();
						streamParser(content);
					}
					streamParser('', true);
					return;
				}
				const formatted = formatResponseBody(content, headers);

				setBodyContent(formatted.content, formatted.highlightJson);
			}

			// Creates native keyboard-accessible disclosure cards without rebuilding earlier events.
			function beginEventStream() {
				streamBody = '';
				streamCount = 0;
				streamExpanded = true;
				streamEventList.replaceChildren();
				document.getElementById('stream-count').textContent = 'Waiting for events…';
				responseBodyContent.classList.add('events-mode');
				streamEvents.classList.remove('hidden');
				streamParser = createEventStreamParser((event) => {
					const card = document.createElement('details');
					card.className = 'stream-event';
					card.open = streamExpanded;
					const summary = document.createElement('summary');
					summary.textContent = 'Event ' + (++streamCount) + ' · ' + event.type + (event.id ? ' · ID: ' + event.id : '');
					const payload = document.createElement('pre');
					try {
						payload.innerHTML = formatJsonHighlight(JSON.stringify(JSON.parse(event.data), null, 2));
					} catch {
						payload.textContent = event.data;
					}
					card.append(summary, payload);
					streamEventList.append(card);
					document.getElementById('stream-count').textContent = streamCount + (streamCount === 1 ? ' event' : ' events');
				});
			}

			// Chooses formatted JSON response output when possible.
			function formatResponseBody(content, headers) {
				const jsonBody = formatJsonResponseBody(content, headers);

				if (jsonBody) {
					return {
						content: jsonBody,
						highlightJson: true,
					};
				}

				return {
					content,
					highlightJson: false,
				};
			}

			// Pretty-prints JSON responses when content type or shape supports it.
			function formatJsonResponseBody(content, headers) {
				if (!hasJsonContentType(headers) && !looksLikeJson(content)) {
					return '';
				}

				try {
					return JSON.stringify(JSON.parse(content), null, 2);
				} catch {
					return '';
				}
			}

			// Heuristically detects JSON bodies without a JSON content type.
			function looksLikeJson(content) {
				const trimmed = content.trim();

				return trimmed.startsWith('{') || trimmed.startsWith('[');
			}

			// Detects JSON response content types.
			function hasJsonContentType(headers) {
				return readHeaderValue(headers, 'Content-Type').toLowerCase().includes('json');
			}

			// Detects HTML response content types for preview rendering.
			function hasHtmlContentType(headers) {
				const contentType = readHeaderValue(headers, 'Content-Type').toLowerCase();

				return contentType.includes('text/html') || contentType.includes('application/xhtml+xml');
			}

			// Shows or clears the sandboxed HTML response preview.
			function setPreviewContent(content, canPreview) {
				responsePreview.classList.toggle('hidden', !canPreview);
				responsePreviewEmpty.classList.toggle('hidden', canPreview);

				if (canPreview) {
					responsePreview.srcdoc = createPreviewDocument(content);
					responsePreviewEmpty.textContent = '';
					return;
				}

				responsePreview.removeAttribute('srcdoc');
				responsePreviewEmpty.textContent = 'HTML preview is available for HTML responses.';
			}

			// Builds an inert preview document that cannot load external resources or run scripts.
			function createPreviewDocument(content) {
				const previewPolicy = "default-src 'none'; script-src 'none'; form-action 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; img-src data:; style-src 'unsafe-inline';";
				const previewHead = '<meta http-equiv="Content-Security-Policy" content="' + previewPolicy + '"><style>a, button, input, select, textarea, label, summary, [role="button"], [onclick] { pointer-events: none !important; } form { pointer-events: none !important; }</style>';

				if (/<head[\\s>]/i.test(content)) {
					return content.replace(/<head([^>]*)>/i, '<head$1>' + previewHead);
				}

				return '<!DOCTYPE html><html><head>' + previewHead + '</head><body>' + content + '</body></html>';
			}

			// Returns line numbers matching the provided text content.
			function formatLineNumbers(content) {
				const lineCount = content.split('\\n').length;

				return Array.from({ length: lineCount }, (_item, index) => String(index + 1)).join('\\n');
			}

		// Renders response headers with theme-aware emphasis on each header name.
		function renderResponseHeaders(headers) {
			const entries = Object.entries(headers);
			responseHeaders.replaceChildren();

			if (entries.length === 0) {
				responseHeaders.textContent = '(none)';
				return;
			}

			entries.forEach(([name, value], index) => {
				const nameElement = document.createElement('span');
				nameElement.className = 'response-header-name';
				nameElement.textContent = name;
				responseHeaders.append(nameElement, document.createTextNode(': ' + value));

				if (index < entries.length - 1) {
					responseHeaders.append(document.createTextNode('\\n'));
				}
			});
		}

		// Formats request duration for the response metadata row.
		function formatDuration(durationMs) {
			if (durationMs < 1000) {
				return Math.round(durationMs) + ' ms';
			}

			return (durationMs / 1000).toFixed(2) + ' s';
		}

		// Formats response body byte size for the response metadata row.
		function formatResponseSize(content) {
			const bytes = new TextEncoder().encode(content).length;

			if (bytes < 1024) {
				return bytes + ' B';
			}

			if (bytes < 1024 * 1024) {
				return (bytes / 1024).toFixed(1) + ' KB';
			}

			return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
		}

		// Formats a loaded request body for the body editor.
		function formatBody(body) {
			if (typeof body === 'string') {
				return body || '(empty)';
			}

			return JSON.stringify(body, null, 2);
		}
	`;
}
