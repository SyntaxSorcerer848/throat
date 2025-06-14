var revert;

declare var __CORE_API_BASE_URL__: string;
declare var __REDIRECT_URL_BASE__: string;

var envConfig = {
    CORE_API_BASE_URL: `${__CORE_API_BASE_URL__}`,
    REDIRECT_URL_BASE: `${__REDIRECT_URL_BASE__}`,
};

var transformStyle = function (style) {
    for (let [key, value] of Object.entries(style)) {
        let new_key = toKebabCase(key);
        if (key !== new_key) {
            //@ts-ignore
            Object.defineProperty(style, new_key, Object.getOwnPropertyDescriptor(style, key));
            delete style[key];
        }
        if (typeof value === 'number' && new_key !== 'z-index') {
            style[new_key] = value + 'px';
        }
    }
    return style;
};

var addStyle = function (styleString) {
    var style = document.createElement('style');
    style.textContent = styleString;
    document.head.append(style);
};

var toKebabCase = function (string) {
    return string.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
};
var createViewElement = function (tag, id, style, children, innerHTML?) {
    var element = document.createElement(tag);
    element.setAttribute('id', id);
    Object.assign(element.style, style);
    for (let index = 0; index < children.length; index++) {
        var e = children[index];
        element.appendChild(e);
    }
    if (innerHTML) {
        element.innerHTML = innerHTML;
    }
    return element;
};

var createCloseButton = function () {
    let svgCloseElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgCloseElement.setAttributeNS(null, 'fill', '#969696');
    svgCloseElement.setAttributeNS(null, 'width', '24');
    svgCloseElement.setAttributeNS(null, 'height', '24');

    var svgCloseElementCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    svgCloseElementCircle.setAttributeNS(null, 'fill', '#B79C9B');
    svgCloseElementCircle.setAttributeNS(null, 'fill-opacity', '0.33');
    svgCloseElementCircle.setAttributeNS(null, 'cx', '12');
    svgCloseElementCircle.setAttributeNS(null, 'cy', '12');
    svgCloseElementCircle.setAttributeNS(null, 'r', '12');
    svgCloseElement.appendChild(svgCloseElementCircle);
    var svgCloseElementPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    svgCloseElementPath.setAttributeNS(
        null,
        'd',
        'M8.24264 8.24271C7.85212 8.63324 7.85212 9.2664 8.24264 9.65692L11.0711 12.4854L8.24264 15.3138C7.85212 15.7043 7.85212 16.3375 8.24264 16.728C8.63316 17.1185 9.26633 17.1185 9.65685 16.728L12.4853 13.8996L15.3137 16.728C15.7042 17.1185 16.3374 17.1185 16.7279 16.728C17.1184 16.3375 17.1184 15.7043 16.7279 15.3138L13.8995 12.4854L16.7279 9.65692C17.1184 9.2664 17.1184 8.63323 16.7279 8.24271C16.3374 7.85219 15.7042 7.85219 15.3137 8.24271L12.4853 11.0711L9.65685 8.24271C9.26633 7.85219 8.63316 7.85219 8.24264 8.24271Z',
    );
    svgCloseElement.appendChild(svgCloseElementPath);

    var closeButton = createViewElement(
        'span',
        'fd-welcome-close-btn',
        transformStyle({
            cursor: 'pointer',
        }),
        [svgCloseElement],
    );
    return closeButton;
};

var openInNewTab = function () {
    var currentUrl = window.location.href;
    var win = window.open(
        'https://revert.dev?utm_campaign=powered&utm_medium=signin&utm_source=' + currentUrl,
        '_blank',
    );
    window.focus();
};

var createPoweredByBanner = function (self) {
    var poweredByLogo = document.createElement('img');
    poweredByLogo.setAttribute(
        'src',
        'https://res.cloudinary.com/dfcnic8wq/image/upload/v1673932396/Revert/Revert_logo_x5ysgh.png',
    );
    poweredByLogo.style.width = '30px';

    var poweredBySpan1 = createViewElement(
        'span',
        'fd-powered-by-title',
        transformStyle({
            fontSize: '14px',
            fontStyle: 'normal',
            fontWeight: '400',
            lineHeight: '13px',
            letterSpacing: '0em',
            color: '#343232',
        }),
        [],
        'Powered By',
    );
    var poweredBySpan3 = createViewElement('span', 'fd-powered-by-logo-img', {}, [poweredByLogo], null);

    var poweredBy = createViewElement(
        'div',
        'fd-powered-by',
        transformStyle({
            display: 'flex',
            width: '100%',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'pointer',
            height: 35,
            background: 'none',
            color: '#fff',
        }),
        [poweredBySpan1, poweredBySpan3],
        '',
    );

    poweredBy.addEventListener('click', openInNewTab.bind(self));
    return poweredBy;
};

var createLoader = function () {
    var loader = document.createElement('span');
    loader.setAttribute('class', 'loader');
    addStyle(`
        .loader {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            display: inline-block;
            position: relative;
            background: linear-gradient(0deg, #2047D033, #2047D0 100%);
            box-sizing: border-box;
            animation: rotation 1s linear infinite;
        }
        .loader::after {
            content: '';  
            box-sizing: border-box;
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: #fff;
        }
        @keyframes rotation {
            0% { transform: rotate(0deg) }
            100% { transform: rotate(360deg)}
        } 
    `);
    return loader;
};

var createIntegrationBlock = function (self, integration) {
    var isInActive = integration.status !== 'active';
    let integrationConnect = document.createElement('div');
    integrationConnect.setAttribute('id', `integration-block-${integration.integrationId}`);
    integrationConnect.setAttribute('class', `integration-block`);
    if (!isInActive) {
        integrationConnect.setAttribute('class', `integration-block-active`);
    }
    integrationConnect.setAttribute('integrationId', integration.integrationId);
    integrationConnect.style.width = '158px';
    integrationConnect.style.height = '82px';
    integrationConnect.style.display = 'flex';
    integrationConnect.style.boxSizing = 'border-box';
    integrationConnect.style.border = '1px solid #E8E8EE33';
    integrationConnect.style.borderRadius = '8px';
    integrationConnect.style.padding = '10px';
    integrationConnect.style.boxShadow = 'rgb(39 47 67 / 13%) 0px 4px 4px 0px';
    integrationConnect.style.position = 'relative';
    integrationConnect.style.alignItems = 'center';
    integrationConnect.style.justifyContent = 'center';

    var image = document.createElement('img');
    image.src = integration.imageSrc;
    image.style.height = '62px';
    image.style.pointerEvents = 'none';
    image.style.objectFit = 'scale-down';
    integrationConnect.appendChild(image);
    if (isInActive) {
        image.style.filter = 'gray';
        image.style['-webkit-filter'] = 'grayscale(1)';
        image.style.filter = 'grayscale(1)';
        integrationConnect.style.cursor = 'not-allowed';
        integrationConnect.title = 'Coming soon';
    }
    return integrationConnect;
};

(function () {
    class Revert {
        CORE_API_BASE_URL: string;
        #API_CRM_METADATA_SUFFIX: string;
        #integrations: any[];
        #state: string;
        #REDIRECT_URL_BASE: string;
        #integrationsLoaded: boolean;
        #USER_REDIRECT_URL?: string;
        #onClose: () => void;

        get REDIRECT_URL_BASE() {
            return this.#REDIRECT_URL_BASE;
        }

        get getIntegrationsLoaded() {
            return this.#integrationsLoaded;
        }

        get USER_REDIRECT_URL() {
            return this.#USER_REDIRECT_URL;
        }

        constructor() {
            this.CORE_API_BASE_URL = envConfig.CORE_API_BASE_URL;
            this.#API_CRM_METADATA_SUFFIX = 'v1/metadata/crms';
            this.#integrations = [];
            this.#state = 'close';
            this.#REDIRECT_URL_BASE = envConfig.REDIRECT_URL_BASE;
            this.#integrationsLoaded = false;
        }

        loadIntegrations = function (config) {
            var requestOptions = {
                mode: 'cors' as RequestMode,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-revert-public-token': this.API_REVERT_PUBLIC_TOKEN,
                },
            };

            let fetchURL = this.CORE_API_BASE_URL + this.#API_CRM_METADATA_SUFFIX;

            fetch(fetchURL, requestOptions)
                .then((response) => response.json())
                .then((result) => {
                    console.log('Revert crm integrations ', result);
                    this.#integrations = result.data;
                    this.#integrationsLoaded = true;
                    config.onLoad();
                })
                .catch((error) => {
                    console.log('error', error);
                    this.#integrationsLoaded = false;
                    config.onError && config.onError();
                });
        };

        init = function (config) {
            // checking if the config is valid
            var { revertToken, tenantId, redirectUrl } = config;
            try {
                if (redirectUrl) {
                    this.#USER_REDIRECT_URL = new URL(redirectUrl).toString();
                }
            } catch (err) {
                console.error('Invalid redirectUrl');
                return;
            }
            if (revertToken == undefined || revertToken == null || tenantId == undefined || tenantId == null) {
                return;
            }

            this.API_REVERT_PUBLIC_TOKEN = config.revertToken;
            this.closeAfterOAuthFlow = config.closeAfterOAuthFlow !== undefined ? config.closeAfterOAuthFlow : true; // TODO: Make this backend controlled.
            this.tenantId = config.tenantId;
            this.#onClose = config.onClose;
            addStyle(`
        @font-face {
            font-family: 'DM Sans';
            font-style: normal;
            font-weight: 700;
        }
        @keyframes fadein {
            from {
                opacity:0;
            }
            to {
                opacity:1;
            }
        }
        @keyframes fadeout {
            from {
                opacity:1;
            }
            to {
                opacity:0;
            }
        }
      `);
            var rootElement = document.getElementById('revert-ui-root');
            if (!rootElement) {
                rootElement = document.createElement('div');
                rootElement.setAttribute('id', 'revert-ui-root');
                document.body.appendChild(rootElement);
            }

            (async () => {
                this.loadIntegrations(config);
            })();
        };

        open = function (integrationId) {
            this.renderInitialStage(integrationId);
        };

        close = function () {
            let rootElement = document.getElementById('revert-ui-root');

            while (rootElement?.firstChild) {
                rootElement.firstChild.remove();
            }
            this.state = 'close';
            if (this.#onClose) {
                this.#onClose();
            }
        };

        redirectToUrl = function (parsedData) {
            if (parsedData.redirectUrl !== undefined) {
                var redirectUrlWithParams = new URL(parsedData.redirectUrl);
                var params = new URLSearchParams(redirectUrlWithParams.search);
                params.append('publicToken', parsedData.publicToken);
                params.append('status', parsedData.status);
                params.append('integrationName', parsedData.integrationName);
                params.append('tenantId', parsedData.tenantId);
                params.append('tenantSecretToken', parsedData.tenantSecretToken);
                redirectUrlWithParams.search = params.toString();
                window.location.assign(redirectUrlWithParams.toString());
            }
        };

        renderInitialStage = function (integrationId) {
            if (!integrationId) {
                let selectedIntegrationId;
                // show every integration possible
                var signInElement = document.createElement('div');
                signInElement.setAttribute('id', 'revert-signin-container');
                signInElement.style.position = 'absolute';
                signInElement.style.top = '15%';
                signInElement.style.width = '390px';
                signInElement.style.display = 'flex';
                signInElement.style.flexDirection = 'column';
                signInElement.style.justifyContent = 'center';
                signInElement.style.alignItems = 'center';
                signInElement.style.background = '#fff';
                signInElement.style.flexDirection = 'column';
                signInElement.style.padding = '32px';
                signInElement.style.boxSizing = 'border-box';
                signInElement.style.borderRadius = '10px';
                signInElement.style.gap = '36px';
                let rootElement = document.getElementById('revert-ui-root');
                if (!rootElement) {
                    console.error('Root element does not exist!');
                    return;
                }
                let closeButton = createCloseButton();
                closeButton.addEventListener('click', this.close.bind(this));
                let headerDiv = createViewElement(
                    'div',
                    'revert-signin-header',
                    transformStyle({
                        fontWeight: 'bold',
                        width: '100%',
                        boxSizing: 'border-box',
                        display: 'flex',
                        alignItems: 'center',
                    }),
                    [],
                );
                let headerText = createViewElement(
                    'span',
                    'revert-signin-header',
                    transformStyle({
                        fontWeight: 'bold',
                        width: '100%',
                        boxSizing: 'border-box',
                        color: '#777',
                    }),
                    [],
                    'Select tool to integrate',
                );
                headerDiv.appendChild(headerText);
                headerDiv.appendChild(closeButton);
                signInElement.appendChild(headerDiv);
                var integrationsContainerWrapper = createViewElement(
                    'div',
                    'integrations-container-wrapper',
                    transformStyle({
                        width: '390px',
                        height: '350px',
                        position: 'relative',
                    }),
                    [],
                );
                signInElement.appendChild(integrationsContainerWrapper);
                var integrationsContainer = createViewElement(
                    'div',
                    'integrations-container',
                    transformStyle({
                        boxSizing: 'border-box',
                        width: '100%',
                        height: '350px',
                        padding: '0 32px',
                        display: 'flex',
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: '10px',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        'scrollbar-width': 'none',
                        position: 'absolute',
                        top: '0',
                        bottom: '0',
                        left: '0',
                        right: '0',
                    }),
                    [],
                );
                integrationsContainerWrapper.appendChild(integrationsContainer);

                for (let index = 0; index < this.#integrations.length; index++) {
                    var integration = this.#integrations[index];
                    let integrationConnectBlock = createIntegrationBlock(this, integration);
                    integrationConnectBlock.addEventListener('click', (ev) => {
                        var target = ev.target as HTMLDivElement;
                        var targetIntegrationId = target.getAttribute('integrationId');
                        var selectedIntegration = this.#integrations.find(
                            (i) => i.integrationId === targetIntegrationId,
                        );
                        if (selectedIntegration.status !== 'active') {
                            return;
                        }
                        selectedIntegrationId = targetIntegrationId;
                        (target.parentElement as HTMLDivElement).childNodes.forEach(
                            (a) => ((a as HTMLDivElement).style.border = '1px solid #E8E8EE33'),
                        );
                        (ev.target as HTMLDivElement).style.border = '2px solid #2047D080';
                        var btn = document.getElementById('connect-integration') as HTMLButtonElement;
                        btn.style.background = '#272DC0';
                        btn.style.cursor = 'pointer';
                    });
                    integrationsContainer.appendChild(integrationConnectBlock);
                }
                var integrationBlockHoverCss =
                    '.integration-block-active:hover { border-color: #2047D044 !important; }';
                var style = document.createElement('style') as any;
                style.setAttribute('type', 'text/css');
                if (style.styleSheet) {
                    style.styleSheet.cssText = integrationBlockHoverCss;
                } else {
                    style.appendChild(document.createTextNode(integrationBlockHoverCss));
                }
                document.getElementsByTagName('head')[0].appendChild(style);

                var button = createViewElement(
                    'div',
                    `connect-integration`,
                    transformStyle({
                        cursor: 'not-allowed',
                        padding: '8px 20px',
                        color: '#fff',
                        textAlign: 'center',
                        alignSelf: 'center',
                        background: 'rgb(39 45 192 / 56%)',
                        borderRadius: 8,
                        fontSize: 20,
                        width: '100%',
                        height: '72px',
                        boxSizing: 'border-box',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }),
                    [],
                    'Connect →',
                );
                button.addEventListener('click', (ev) => {
                    var selectedIntegration = this.#integrations.find(
                        (int) => int.integrationId === selectedIntegrationId,
                    );
                    this.handleIntegrationRedirect(selectedIntegration);
                });
                signInElement.appendChild(button);
                let signInElementWrapper = createViewElement(
                    'div',
                    'revert-signin-container-wrapper',
                    transformStyle({
                        position: 'absolute',
                        'z-index': 99999999,
                        display: 'flex',
                        'justify-content': 'center',
                        'align-items': 'flex-start',
                        background: 'rgba(54, 54, 54, 0.4)',
                        width: '100%',
                        height: '100%',
                        left: 0,
                        top: 0,
                    }),
                    [signInElement],
                );
                signInElementWrapper.style.animation = 'fadein .8s forwards';
                signInElementWrapper.style.transition = 'color 500ms ease-in-out';
                signInElementWrapper.addEventListener('click', (event) => {
                    if (!signInElement.contains(event.target)) {
                        signInElementWrapper.style.animation = 'fadeoout .8s forwards';
                        signInElementWrapper.style.transition = 'color 500ms ease-in-out';
                    }
                });
                rootElement.appendChild(signInElementWrapper);
                this.state = 'open';
            } else {
                var selectedIntegration = this.#integrations.find(
                    (integration) => integration.integrationId === integrationId,
                );
                this.handleIntegrationRedirect(selectedIntegration);
            }
        };

        clearInitialOrProcessingOrSuccessStage = function () {
            var container = document.getElementById('revert-signin-container');
            while (container?.firstChild) {
                container.removeChild(container.lastChild);
            }
        };

        renderProcessingStage = function (message) {
            var el = document.createElement('div');
            var processingText = createViewElement(
                'span',
                'processing-header',
                transformStyle({
                    fontWeight: 'bold',
                    width: '100%',
                    boxSizing: 'border-box',
                    color: '#777',
                }),
                [],
                message,
            );
            el.appendChild(processingText);
            var container = document.getElementById('revert-signin-container');
            container.style.height = '534px';
            var loadingArea = document.createElement('div');
            loadingArea.style.display = 'flex';
            loadingArea.style.flexDirection = 'column';
            loadingArea.style.alignItems = 'center';
            loadingArea.style.gap = '15px';
            var loader = createLoader();
            loadingArea.appendChild(loader);
            loadingArea.appendChild(el);
            container.appendChild(loadingArea);
            var poweredByBanner = createPoweredByBanner(this);
            poweredByBanner.style.position = 'absolute';
            poweredByBanner.style.bottom = '10px';
            poweredByBanner.style.left = '0';
            container.appendChild(poweredByBanner);
        };

        renderFailedStage = function () {
            var el = document.createElement('div');
            var failedText = createViewElement(
                'span',
                'processing-header',
                transformStyle({
                    fontWeight: 'bold',
                    width: '100%',
                    boxSizing: 'border-box',
                    color: '#777',
                }),
                [],
                'Something went wrong...',
            );
            el.appendChild(failedText);
            var container = document.getElementById('revert-signin-container');
            container.style.height = '534px';
            let closeButton = createCloseButton();
            closeButton.addEventListener('click', this.close.bind(this));
            closeButton.style.position = 'absolute';
            closeButton.style.right = '20px';
            closeButton.style.top = '20px';
            container.appendChild(closeButton);
            var poweredByBanner = createPoweredByBanner(this);
            poweredByBanner.style.position = 'absolute';
            poweredByBanner.style.bottom = '10px';
            poweredByBanner.style.left = '0';
            container.appendChild(el);
            container.appendChild(poweredByBanner);
        };

        renderSuccessStage = function (fieldMappingData, parsedData, tenantToken) {
            console.log(fieldMappingData);
            if (this.closeAfterOAuthFlow) {
                this.redirectToUrl(parsedData);
                return this.close();
            }

            if (!(fieldMappingData.mappableFields || []).length) {
                this.redirectToUrl(parsedData);
                return this.renderDoneStage(parsedData.integrationName);
            }

            var container = document.getElementById('revert-signin-container');
            var poweredByBanner = createPoweredByBanner(this);
            poweredByBanner.style.position = 'absolute';
            poweredByBanner.style.bottom = '10px';
            poweredByBanner.style.left = '0';
            container.appendChild(poweredByBanner);

            container.style.alignItems = null;
            container.style.justifyContent = null;
            container.style.gap = '5px';
            container.style.minHeight = '534px';
            container.style.maxHeight = '80%';
            container.style.paddingBottom = '48px';
            container.style.height = null;

            let closeButton = createCloseButton();
            closeButton.addEventListener('click', this.close.bind(this));
            closeButton.style.position = 'absolute';
            closeButton.style.right = '20px';
            closeButton.style.top = '20px';
            container.appendChild(closeButton);

            var header = createViewElement(
                'div',
                '',
                transformStyle({
                    fontFamily: 'Inter',
                    fontSize: '20px',
                    fontWeight: '500',
                    lineHeight: '27px',
                    color: '#656468',
                }),
                [],
                'Field mappings',
            );
            var subHeader = createViewElement(
                'div',
                '',
                transformStyle({
                    fontFamily: 'Inter',
                    fontSize: '14px',
                    fontWeight: '400',
                    lineHeight: '19px',
                    color: '#656468',
                    marginBottom: '5px',
                }),
                [],
                `Map fields specific to your ${parsedData.integrationName} Account`,
            );
            container.appendChild(header);
            container.appendChild(subHeader);
            var inputContainer = document.createElement('div');
            inputContainer.style.overflowY = 'auto';
            inputContainer.style.padding = '5px';
            inputContainer.style.height = '400px';
            container.appendChild(inputContainer);
            fieldMappingData.mappableFields.forEach((field) => {
                var p = this.getFieldMappingInputPair(
                    field.fieldName,
                    fieldMappingData.fieldList[field.objectName],
                    field.objectName,
                );
                inputContainer.appendChild(p);
            });

            if (fieldMappingData.canAddCustomMapping) {
                var addBtn = createViewElement(
                    'div',
                    '',
                    transformStyle({
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: '#D9D9D9',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }),
                    [],
                    `+`,
                );
                addBtn.classList.add('add-btn');
                addStyle(`
                    .add-btn:hover {
                        background: #c9c9c9 !important;
                    }
                    .input-style {
                        box-shadow: 0px 4px 10px 0px #1A1E301A;
                        padding: 10px;
                        border-radius: 5px;
                        outline: none;
                        border: 1px solid transparent;
                        border-right: 10px solid transparent;
                    }
                    .invalid-form-field {
                        border-color: red;
                    }
                `);
                container.appendChild(addBtn);
                let customEntries = 0;
                addBtn.addEventListener('click', () => {
                    var p = this.getCustomFieldMappingInputPair(fieldMappingData.fieldList, customEntries);
                    customEntries++;
                    inputContainer.appendChild(p);
                });
            }
            var saveButton = createViewElement(
                'div',
                `save-mapping`,
                transformStyle({
                    cursor: 'pointer',
                    padding: '8px 20px',
                    color: '#fff',
                    textAlign: 'center',
                    alignSelf: 'center',
                    background: '#272DC0',
                    borderRadius: 8,
                    fontSize: 20,
                    width: '100%',
                    height: '72px',
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: '50px',
                    marginBottom: '20px',
                }),
                [],
                'Save Mappings',
            );
            saveButton.addEventListener('click', () => {
                var getElTextContent = (el: any) => {
                    if (!el.textContent) {
                        el.classList.add('invalid-form-field');
                    } else {
                        el.classList.remove('invalid-form-field');
                    }
                    return el.textContent;
                };
                var getElValue = (el: any) => {
                    if (!el.value) {
                        el.classList.add('invalid-form-field');
                    } else {
                        el.classList.remove('invalid-form-field');
                    }
                    return el.value;
                };
                var objectsEl = document.getElementsByClassName('stdHiddenObj');
                var objects = Array.from(objectsEl).map(getElTextContent);
                var lablesEl = document.getElementsByClassName('mappableInput');
                var lables = Array.from(lablesEl).map(getElValue);
                var valuesEl = document.getElementsByClassName('accountSpecificInput');
                var values = Array.from(valuesEl).map(getElValue);
                var standardMappings = lables.map((l, i) => ({
                    sourceFieldName: values[i],
                    targetFieldName: l,
                    object: objects[i],
                }));
                console.log('standardMappings', standardMappings);

                var customObjectsEl = document.querySelectorAll('[id^="custom-object-"]');
                var customObjects = Array.from(customObjectsEl).map(getElValue);
                var customLablesEl = document.querySelectorAll('[id^="custom-mappableInput-"]');
                var customLables = Array.from(customLablesEl).map(getElValue);
                var customValuesEl = document.querySelectorAll('[id^="custom-accountSpecificInput-"]');
                var customValues = Array.from(customValuesEl).map(getElValue);
                var customMappings = customLables.map((l, i) => ({
                    sourceFieldName: customValues[i],
                    targetFieldName: l,
                    object: customObjects[i],
                }));
                console.log('customMappings', customMappings);

                var isEmptyField = [...standardMappings, ...customMappings].some(
                    (mapping) => !mapping.object || !mapping.sourceFieldName || !mapping.targetFieldName,
                );
                if (isEmptyField) {
                    return;
                }

                // save field mapping
                this.clearInitialOrProcessingOrSuccessStage();
                this.renderProcessingStage('Saving mapping configuration'); // Show loader when the user clicks on Save Mappings
                fetch(`${this.CORE_API_BASE_URL}field-mapping`, {
                    mode: 'cors' as RequestMode,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-revert-t-id': this.tenantId,
                        'x-revert-t-token': tenantToken,
                        'x-revert-public-token': this.API_REVERT_PUBLIC_TOKEN,
                    },
                    body: JSON.stringify({ standardMappings, customMappings }),
                })
                    .then((data) => data.json())
                    .then((data) => {
                        this.clearInitialOrProcessingOrSuccessStage();
                        this.redirectToUrl(parsedData);
                        this.renderDoneStage(parsedData.integrationName);
                    });
            });
            container.appendChild(saveButton);
        };

        renderDoneStage = function (integrationName) {
            var el = document.createElement('div');
            var connectedText = createViewElement(
                'span',
                'done-header',
                transformStyle({
                    fontWeight: 'bold',
                    width: '100%',
                    boxSizing: 'border-box',
                    color: '#777',
                    textAlign: 'center',
                }),
                [],
                `Connected to ${integrationName}`,
            );
            var msgContainer = document.createElement('div');
            msgContainer.style.display = 'flex';
            msgContainer.style.flexDirection = 'column';
            msgContainer.style.alignItems = 'center';
            msgContainer.style.justifyContent = 'center';
            msgContainer.style.gap = '15px';
            msgContainer.style.position = 'absolute';
            msgContainer.style.top = '75px';
            msgContainer.style.left = '0';
            msgContainer.style.right = '0';
            var tick = this.getDoneTick();
            msgContainer.appendChild(tick);
            msgContainer.appendChild(connectedText);
            el.appendChild(msgContainer);

            var container = document.getElementById('revert-signin-container');
            container.style.height = '534px';
            var poweredByBanner = createPoweredByBanner(this);
            poweredByBanner.style.position = 'absolute';
            poweredByBanner.style.bottom = '10px';
            poweredByBanner.style.left = '0';
            container.appendChild(el);
            container.appendChild(poweredByBanner);

            var doneButton = createViewElement(
                'div',
                '',
                transformStyle({
                    cursor: 'pointer',
                    padding: '8px 20px',
                    color: '#fff',
                    textAlign: 'center',
                    alignSelf: 'center',
                    background: '#272DC0',
                    borderRadius: 8,
                    fontSize: 20,
                    height: '72px',
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'absolute',
                    width: '80%',
                    bottom: '75px',
                }),
                [],
                'Close',
            );
            doneButton.addEventListener('click', () => this.close());
            container.appendChild(doneButton);
        };

        getDoneTick = function () {
            var el = document.createElement('span');
            el.innerHTML = `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M32 2C15.431 2 2 15.432 2 32C2 48.568 15.432 62 32 62C48.568 62 62 48.568 62 32C62 15.432 48.568 2 32 2ZM25.025 50L25.005 49.98L24.988 50L11 35.6L18.029 28.436L25.006 35.62L46.006 14.001L53 21.199L25.025 50Z" fill="#43A047"/></svg>`;
            return el;
        };

        getFieldMappingInputPair = function (fieldName, data, objectName) {
            var options = data.map((a) => {
                var op = document.createElement('option');
                op.setAttribute('value', a.name);
                op.innerHTML = a.name;
                return op;
            });
            var objectHeading = createViewElement(
                'div',
                '',
                transformStyle({
                    fontWeight: '400',
                    fontSize: '12px',
                    color: '#4C505B',
                }),
                [],
                'Object',
            );
            var hiddenObject = createViewElement(
                'div',
                '',
                transformStyle({
                    visibility: 'hidden',
                    height: '1px',
                }),
                [],
                objectName,
            );
            hiddenObject.classList.add('stdHiddenObj');
            var objInput = createViewElement(
                'div',
                `sd-object-${fieldName}`,
                transformStyle({
                    fontWeight: '400',
                    fontSize: '12px',
                }),
                [],
                objectName,
            );
            objInput.classList.add('input-style');
            var mappableHeading = createViewElement(
                'div',
                '',
                transformStyle({
                    fontWeight: '400',
                    fontSize: '12px',
                    color: '#4C505B',
                }),
                [],
                'Mappable field name',
            );
            var mappableInput = createViewElement(
                'input',
                `mappable-input-${fieldName}`,
                transformStyle({
                    fontWeight: '400',
                    fontSize: '12px',
                    background: 'transparent',
                }),
                [],
                '',
            );
            mappableInput.classList.add('mappableInput');
            mappableInput.classList.add('input-style');
            mappableInput.setAttribute('disabled', true);
            mappableInput.setAttribute('value', fieldName);

            var accountSpecificHeading = createViewElement(
                'div',
                '',
                transformStyle({
                    fontWeight: '400',
                    fontSize: '12px',
                    color: '#4C505B',
                }),
                [],
                'Account specific field name',
            );
            var accountSpecificInput = createViewElement(
                'select',
                `account-input-${fieldName}`,
                transformStyle({
                    fontWeight: '400',
                    fontSize: '12px',
                    background: 'transparent',
                }),
                options,
                '',
            );
            accountSpecificInput.classList.add('accountSpecificInput');
            accountSpecificInput.classList.add('input-style');

            var container = createViewElement(
                'div',
                '',
                transformStyle({
                    display: 'flex',
                    flexDirection: 'column',
                    marginBottom: '25px',
                    gap: '10px',
                }),
                [
                    hiddenObject,
                    objectHeading,
                    objInput,
                    mappableHeading,
                    mappableInput,
                    accountSpecificHeading,
                    accountSpecificInput,
                ],
                '',
            );
            return container;
        };

        getCustomFieldMappingInputPair = function (fieldList, n) {
            var dividerContainer = createViewElement(
                'div',
                '',
                transformStyle({
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '10px 0',
                }),
                [],
                '',
            );
            var divider = createViewElement(
                'div',
                '',
                transformStyle({
                    width: '100%',
                    height: '2px',
                    borderRadius: '10px',
                    background: '#272DC0',
                }),
                [],
                '',
            );
            divider.classList.add('section-divider');
            dividerContainer.appendChild(divider);
            var removeBtn = createViewElement(
                'div',
                `remove-btn-custom-${n}`,
                transformStyle({
                    width: '15px',
                    height: '15px',
                    cursor: 'pointer',
                    position: 'absolute',
                    top: '30px',
                    right: '0',
                    borderRadius: '10px',
                    color: 'white',
                    fontSize: '12px',
                    background: 'rgba(183, 156, 155, 0.33)',
                    textAlign: 'center',
                }),
                [],
                'x',
            );
            removeBtn.addEventListener('click', () => {
                document.getElementById(`custom-pair-container-${n}`)?.remove();
            });
            var getOptions = (obj) =>
                (fieldList[obj] || []).map((a) => {
                    var op = document.createElement('option');
                    op.setAttribute('value', a.name);
                    op.innerHTML = a.name;
                    return op;
                });
            var objOptions = Object.keys(fieldList).map((a) => {
                var op = document.createElement('option');
                op.setAttribute('value', a);
                op.innerHTML = a;
                return op;
            });
            var objectHeading = createViewElement(
                'div',
                '',
                transformStyle({
                    fontWeight: '400',
                    fontSize: '12px',
                    color: '#4C505B',
                }),
                [],
                'Object',
            );
            var objInput = createViewElement(
                'select',
                `custom-object-${n}`,
                transformStyle({
                    fontWeight: '400',
                    fontSize: '12px',
                }),
                objOptions,
                '',
            );
            objInput.classList.add('input-style');
            objInput.addEventListener('change', (ev) => {
                let a = document.getElementById(`custom-accountSpecificInput-${n}`);
                while (a.firstChild) {
                    a.removeChild(a.lastChild);
                }
                getOptions(ev.target.value).map((b) => a.appendChild(b));
            });
            var mappableHeading = createViewElement(
                'div',
                `custom-mappableHeading-${n}`,
                transformStyle({
                    fontWeight: '400',
                    fontSize: '12px',
                    color: '#4C505B',
                }),
                [],
                'Mappable field name',
            );
            var mappableInput = createViewElement(
                'input',
                `custom-mappableInput-${n}`,
                transformStyle({
                    fontWeight: '400',
                    fontSize: '12px',
                }),
                [],
                '',
            );
            mappableInput.classList.add('input-style');

            var accountSpecificHeading = createViewElement(
                'div',
                `custom-accountSpecificHeading-${n}`,
                transformStyle({
                    fontWeight: '400',
                    fontSize: '12px',
                    color: '#4C505B',
                }),
                [],
                'Account specific field name',
            );
            var accountSpecificInput = createViewElement(
                'select',
                `custom-accountSpecificInput-${n}`,
                transformStyle({
                    fontWeight: '400',
                    fontSize: '12px',
                }),
                getOptions('company'),
                '',
            );
            accountSpecificInput.classList.add('input-style');

            var container = createViewElement(
                'div',
                `custom-pair-container-${n}`,
                transformStyle({
                    display: 'flex',
                    flexDirection: 'column',
                    marginBottom: '25px',
                    gap: '10px',
                    position: 'relative',
                }),
                [
                    dividerContainer,
                    objectHeading,
                    removeBtn,
                    objInput,
                    mappableHeading,
                    mappableInput,
                    accountSpecificHeading,
                    accountSpecificInput,
                ],
                '',
            );
            return container;
        };

        showAndRemoveLoader = function () {
            return new Promise<void>((resolve) => {
                //show loader
                this.renderProcessingStage('Loading');

                //remove loader
                setTimeout(() => {
                    var loaderElement = document.querySelector('.loader');

                    if (loaderElement) {
                        var parentElement = loaderElement.parentElement;
                        if (parentElement) {
                            parentElement.remove();
                        }
                    }

                    // Check again if the loader element exists
                    var loaderElementAfterTimeout = document.querySelector('.loader');
                    if (!loaderElementAfterTimeout) {
                        resolve();
                    }
                }, 250);
            });
        };

        apiKeyInputContainerFunction = function () {
            var parentDiv = document.createElement('div');
            parentDiv.id = 'parentDiv';
            parentDiv.style.display = 'flex';
            parentDiv.style.flexDirection = 'column';
            parentDiv.style.alignItems = 'center';
            parentDiv.style.justifyContent = 'center';
            parentDiv.style.position = 'relative';
            parentDiv.style.width = '100%';

            // Create heading
            var heading = document.createElement('h3');
            heading.textContent = 'Enter your API key';
            heading.style.textAlign = 'center';
            heading.style.textDecoration = 'underline';
            heading.style.marginBottom = '25px';
            parentDiv.appendChild(heading);

            var inputParentContainer = document.createElement('div');
            inputParentContainer.style.display = 'flex';
            inputParentContainer.style.alignItems = 'end';
            inputParentContainer.style.justifyContent = 'space-between';
            inputParentContainer.style.width = '100%';
            inputParentContainer.style.marginTop = '20px';
            inputParentContainer.style.flexDirection = 'column';
            inputParentContainer.style.gap = '10px';

            // Create input field and label container
            var inputContainer = document.createElement('div');
            inputContainer.style.display = 'flex';
            inputContainer.style.alignItems = 'center';
            inputContainer.style.flexGrow = '1';
            inputContainer.style.width = '100%';

            var apiKeyLabel = document.createElement('label');
            apiKeyLabel.textContent = 'API Key:';
            apiKeyLabel.setAttribute('for', 'api-key-input');
            apiKeyLabel.style.marginRight = '10px';
            apiKeyLabel.style.fontWeight = 'bold';

            var apiKeyInput = document.createElement('input');
            apiKeyInput.setAttribute('type', 'text');
            apiKeyInput.setAttribute('id', 'api-key-input');
            apiKeyInput.style.flexGrow = '1';
            apiKeyInput.style.padding = '4px';

            inputContainer.appendChild(apiKeyLabel);
            inputContainer.appendChild(apiKeyInput);

            // Create submit button
            var submitButton = document.createElement('button');
            submitButton.id = 'submitButtonBasicAuth';
            submitButton.textContent = 'Submit';
            submitButton.style.marginLeft = '10px';
            submitButton.style.background = 'rgb(39 45 192)';
            submitButton.style.borderRadius = '5px';
            submitButton.style.display = 'flex';
            submitButton.style.alignItems = 'center';
            submitButton.style.justifyContent = 'center';
            submitButton.style.padding = '10px';
            submitButton.style.color = '#fff';
            submitButton.style.cursor = 'pointer';
            submitButton.style.position = 'relative';
            submitButton.disabled = true; // Initially disable the button
            submitButton.style.opacity = '0.5';

            // Append input container and button to the inputParentContainer
            inputParentContainer.appendChild(inputContainer);
            inputParentContainer.appendChild(submitButton);

            // Append inputParentContainer to parentDiv
            parentDiv.appendChild(inputParentContainer);

            return parentDiv;
        };

        modalForApiKeyInputBasicAuth = function () {
            return new Promise((resolve, reject) => {
                var container = document.getElementById('revert-signin-container');
                container.style.height = '534px';

                // Remove all children of the container
                while (container.firstChild) {
                    container.removeChild(container.firstChild);
                }

                this.showAndRemoveLoader().then(() => {
                    //close button
                    var closeButton = createCloseButton();
                    closeButton.style.position = 'absolute';
                    closeButton.style.right = '20px';
                    closeButton.style.top = '20px';
                    closeButton.addEventListener('click', () => {
                        reject('Modal closed by user');
                        this.close();
                    });

                    var apiKeyInputContainer = this.apiKeyInputContainerFunction();
                    container.appendChild(closeButton);
                    container.appendChild(apiKeyInputContainer);

                    var inputElementForApiInput = apiKeyInputContainer.querySelector('#api-key-input');
                    var submitButtonForApiInputSubmission =
                        apiKeyInputContainer.querySelector('#submitButtonBasicAuth');

                    //event listener on input to change the disability of submit
                    inputElementForApiInput.addEventListener('input', function () {
                        if (inputElementForApiInput.value.trim() !== '') {
                            submitButtonForApiInputSubmission.disabled = false;
                            submitButtonForApiInputSubmission.style.opacity = '1';
                        } else {
                            submitButtonForApiInputSubmission.disabled = true;
                            submitButtonForApiInputSubmission.style.opacity = '0.5';
                        }
                    });

                    //event listener for submission go Api key
                    submitButtonForApiInputSubmission.addEventListener('click', () => {
                        submitButtonForApiInputSubmission.disabled = true;
                        submitButtonForApiInputSubmission.style.opacity = '0.5';

                        var apiKey = inputElementForApiInput.value;

                        resolve(apiKey);
                    });
                });
            });
        };

        handleIntegrationRedirect = async function (selectedIntegration) {
            if (selectedIntegration) {
                var scopes = selectedIntegration.scopes;
                var state = JSON.stringify({
                    tenantId: this.tenantId,
                    revertPublicToken: this.API_REVERT_PUBLIC_TOKEN,
                    ...(this.#USER_REDIRECT_URL && { redirectUrl: this.#USER_REDIRECT_URL }),
                });
                if (selectedIntegration.integrationId === 'hubspot') {
                    window.open(
                        `https://app.hubspot.com/oauth/authorize?client_id=${
                            selectedIntegration.clientId
                        }&redirect_uri=${this.#REDIRECT_URL_BASE}/hubspot&scope=${scopes.join('%20')}&state=${state}`,
                    );
                } else if (selectedIntegration.integrationId === 'zohocrm') {
                    window.open(
                        `https://accounts.zoho.com/oauth/v2/auth?scope=${scopes.join(',')}&client_id=${
                            selectedIntegration.clientId
                        }&response_type=code&access_type=offline&redirect_uri=${
                            this.#REDIRECT_URL_BASE
                        }/zohocrm&state=${encodeURIComponent(state)}`,
                    );
                } else if (selectedIntegration.integrationId === 'sfdc') {
                    var queryParams = {
                        response_type: 'code',
                        client_id: selectedIntegration.clientId,
                        redirect_uri: `${this.#REDIRECT_URL_BASE}/sfdc`,
                        state,
                    };
                    var urlSearchParams = new URLSearchParams(queryParams);
                    var queryString = urlSearchParams.toString();
                    window.open(
                        `https://login.salesforce.com/services/oauth2/authorize?${queryString}${
                            scopes.length ? `&scope=${scopes.join('%20')}` : ''
                        }`,
                    );
                } else if (selectedIntegration.integrationId === 'pipedrive') {
                    window.open(
                        `https://oauth.pipedrive.com/oauth/authorize?client_id=${
                            selectedIntegration.clientId
                        }&redirect_uri=${this.#REDIRECT_URL_BASE}/pipedrive&state=${state}`,
                    );
                } else if (selectedIntegration.integrationId === 'closecrm') {
                    window.open(
                        `https://app.close.com/oauth2/authorize/?client_id=${
                            selectedIntegration.clientId
                        }&response_type=code&state=${encodeURIComponent(state)}`,
                    );
                } else if (selectedIntegration.integrationId === 'ms_dynamics_365_sales') {
                    window.open(
                        `https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?client_id=${
                            selectedIntegration.clientId
                        }&response_type=code&redirect_uri=${
                            this.#REDIRECT_URL_BASE
                        }/ms_dynamics_365_sales&response_mode=query&scope=${scopes.join('%20')}&state=${state}`,
                    );
                } else if (selectedIntegration.integrationId === 'slack') {
                    window.open(
                        `https://slack.com/oauth/v2/authorize?client_id=${selectedIntegration.clientId}&redirect_uri=${
                            this.#REDIRECT_URL_BASE
                        }/slack&scope=${scopes.join(',')}&user_scope=identity.basic,identity.email&state=${state}`,
                    );
                } else if (selectedIntegration.integrationId === 'discord') {
                    var encodedRedirectURI = encodeURIComponent(this.#REDIRECT_URL_BASE);
                    window.open(
                        `https://discord.com/api/oauth2/authorize?client_id=${
                            selectedIntegration.clientId
                        }&redirect_uri=${encodedRedirectURI}/discord&response_type=code&scope=${scopes.join(
                            '%20',
                        )}&state=${state}`,
                    );
                } else if (selectedIntegration.integrationId === 'linear') {
                    var encodedRedirectURI = encodeURIComponent(this.#REDIRECT_URL_BASE);
                    window.open(
                        `https://linear.app/oauth/authorize?client_id=${
                            selectedIntegration.clientId
                        }&redirect_uri=${encodedRedirectURI}/linear&response_type=code&scope=${scopes.join(
                            ',',
                        )}&state=${state}`,
                    );
                } else if (selectedIntegration.integrationId === 'clickup') {
                    window.open(
                        `https://app.clickup.com/api?client_id=${selectedIntegration.clientId}&redirect_uri=${
                            this.#REDIRECT_URL_BASE
                        }/clickup&state=${state}`,
                    );
                } else if (selectedIntegration.integrationId === 'trello') {
                    fetch(
                        `${this.CORE_API_BASE_URL}ticket/trello-request-token?tenantId=${
                            this.tenantId
                        }&revertPublicToken=${this.API_REVERT_PUBLIC_TOKEN}${
                            this.#USER_REDIRECT_URL ? `&redirectUrl=${this.#USER_REDIRECT_URL}` : ``
                        }`,
                    )
                        .then((data) => data.json())
                        .then((data) => {
                            if (data.oauth_token) {
                                window.open(
                                    `${data.authorizeURL}?oauth_token=${data.oauth_token}&scope=${scopes.join(
                                        ',',
                                    )}&expiration=${data.expiration}`,
                                );
                            }
                        });
                } else if (selectedIntegration.integrationId === 'jira') {
                    var encodedScopes = encodeURIComponent(scopes.join(' '));
                    var encodedRedirectUri = encodeURI(`${this.#REDIRECT_URL_BASE}/jira`);

                    window.open(
                        `https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=${
                            selectedIntegration.clientId
                        }&scope=${encodedScopes}&redirect_uri=${encodedRedirectUri}&state=${encodeURIComponent(
                            state,
                        )}&response_type=code&prompt=consent`,
                    );
                } else if (selectedIntegration.integrationId === 'bitbucket') {
                    window.open(
                        `https://bitbucket.org/site/oauth2/authorize?client_id=${
                            selectedIntegration.clientId
                        }&response_type=code&state=${encodeURIComponent(state)}`,
                    );
                } else if (selectedIntegration.integrationId === 'greenhouse') {
                    var apiKey = await this.modalForApiKeyInputBasicAuth();
                    var url = `${this.CORE_API_BASE_URL}v1/ats/oauth-callback?integrationId=${
                        selectedIntegration.integrationId
                    }&t_id=${this.tenantId}&code=${apiKey}&x_revert_public_token=${this.API_REVERT_PUBLIC_TOKEN}${
                        this.#USER_REDIRECT_URL ? `&redirectUrl=${this.#USER_REDIRECT_URL}` : ``
                    }`;
                    fetch(url, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                    })
                        .then((d) => {
                            return d.json();
                        })
                        .then((data) => {
                            if (data.error) {
                                var errorMessage =
                                    data.error?.code === 'P2002'
                                        ? ': Already connected another CRM. Please disconnect first.'
                                        : '';

                                console.log('error:', errorMessage);
                            } else {
                                console.log('OAuth flow succeeded', data);
                            }
                        })
                        .catch((error) => {
                            console.log(error);
                            return this.renderFailedStage();
                        });
                } else if (selectedIntegration.integrationId === 'lever') {
                    var encodedScopes = encodeURIComponent(scopes.join(' '));
                    var encodedRedirectUri = encodeURI(`${this.#REDIRECT_URL_BASE}/lever`);

                    fetch(
                        `${this.CORE_API_BASE_URL}ats/lever-app_config?revertPublicToken=${this.API_REVERT_PUBLIC_TOKEN}`,
                    )
                        .then((data) => data.json())
                        .then((data) => {
                            if (data.env === 'Sandbox') {
                                window.open(
                                    `https://sandbox-lever.auth0.com/authorize?client_id=${
                                        selectedIntegration.clientId
                                    }&redirect_uri=${encodedRedirectUri}&response_type=code&state=${encodeURIComponent(
                                        state,
                                    )}&prompt=consent&scope=${encodedScopes}&audience=https://api.sandbox.lever.co/v1/`,
                                );
                            } else {
                                window.open(
                                    `https://auth.lever.co/authorize?client_id=${
                                        selectedIntegration.clientId
                                    }&redirect_uri=${encodedRedirectUri}&response_type=code&state=${encodeURIComponent(
                                        state,
                                    )}&prompt=consent&scope=${encodedScopes}&audience=https://api.lever.co/v1/`,
                                );
                            }
                        });
                } else if (selectedIntegration.integrationId === 'github') {
                    var encodedScopes = encodeURIComponent(scopes.join(','));
                    var encodedRedirectUri = encodeURI(`${this.#REDIRECT_URL_BASE}/github`);

                    window.open(
                        `https://github.com/login/oauth/authorize?client_id=${
                            selectedIntegration.clientId
                        }&redirect_uri=${encodedRedirectUri}&scope=${encodedScopes}&state=${encodeURIComponent(
                            state,
                        )}&response_type=code`,
                    );
                } else if (selectedIntegration.integrationId === 'quickbooks') {
                    var encodedScopes = encodeURIComponent(scopes.join(' '));
                    var encodedRedirectUri = encodeURI(`${this.#REDIRECT_URL_BASE}/quickbooks`);

                    window.open(
                        `https://appcenter.intuit.com/connect/oauth2?client_id=${
                            selectedIntegration.clientId
                        }&redirect_uri=${encodedRedirectUri}&response_type=code&state=${encodeURIComponent(
                            state,
                        )}&scope=${encodedScopes}`,
                    );
                } else if (selectedIntegration.integrationId === 'xero') {
                    var encodedScopes = encodeURIComponent(scopes.join(' '));
                    var encodedRedirectUri = encodeURI(`${this.#REDIRECT_URL_BASE}/xero`);

                    window.open(
                        `https://login.xero.com/identity/connect/authorize?client_id=${
                            selectedIntegration.clientId
                        }&redirect_uri=${encodedRedirectUri}&response_type=code&state=${encodeURIComponent(
                            state,
                        )}&scope=${encodedScopes}`,
                    );
                }
                this.clearInitialOrProcessingOrSuccessStage();
                if (!this.closeAfterOAuthFlow) {
                    this.renderProcessingStage('Integration setup in progress...');
                } else {
                    this.close();
                }
                var evtSource = new EventSource(
                    `${this.CORE_API_BASE_URL}connection/integration-status/${this.API_REVERT_PUBLIC_TOKEN}?tenantId=${this.tenantId}`,
                );
                evtSource.onmessage = (event) => {
                    var data = JSON.parse(event.data);
                    var parsedData = JSON.parse(data);
                    console.log(parsedData);
                    if (parsedData.status === 'FAILED') {
                        this.clearInitialOrProcessingOrSuccessStage();
                        evtSource.close();
                        this.redirectToUrl(parsedData);
                        if (this.closeAfterOAuthFlow) {
                            return this.close();
                        }
                        this.renderFailedStage();
                    }
                    if (parsedData.status === 'SUCCESS') {
                        var processingMsg = document.getElementById('processing-header');
                        if (processingMsg) {
                            processingMsg.innerHTML = 'fetching account properties..';
                        }
                        evtSource.close();
                        var tenantToken = parsedData.tenantSecretToken;
                        // fetch field mapping

                        fetch(`${this.CORE_API_BASE_URL}field-mapping`, {
                            mode: 'cors' as RequestMode,
                            method: 'GET',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-revert-t-id': this.tenantId,
                                'x-revert-t-token': tenantToken,
                                'x-revert-public-token': this.API_REVERT_PUBLIC_TOKEN,
                            },
                        })
                            .then((data) => data.json())
                            .then((data) => {
                                this.clearInitialOrProcessingOrSuccessStage();
                                this.renderSuccessStage(data, parsedData, tenantToken);
                            });
                    }
                };
            } else {
                console.warn('Invalid integration ID provided.');
            }
        };
    }
    revert = new Revert();
})();
module.exports = revert;
(window as any).Revert = revert;
