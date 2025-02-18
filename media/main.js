const MAX_CHAT_HISTORY = 50;
const MAX_PROMPT_HISTORY = 10;

(function() {
    const vscode = acquireVsCodeApi();

    // App HTML content
    const htmlContent = `
        <div id="chat-view" class="flex-1 overflow-y-auto flex flex-col space-y-4 pb-4 h-full"></div>
        <div id="control-panel" class="flex flex-col p-6 pb-9 border-t-2 rounded relative">
            <div class="suggestions-container absolute w-full z-10 p-4 pb-0 border-t-2 rounded"></div>
            <div class="flex items-center space-x-4">
                <span class="font-bold">📜 Lean Scribe</span>
                <input type="text" placeholder="Render prompt..." class="prompt-input flex-1 px-4 py-2 rounded">
                <button id="refresh-button" class="text-lg transparent">🔄</button>
            </div>
        </div>
    `;

    // Insert the HTML content into the app element
    const app = document.getElementById('app');
    app.classList.add('flex', 'flex-col', 'h-screen');
    app.innerHTML = htmlContent;

    const chatView = document.getElementById('chat-view');
    const controlPanel = document.getElementById('control-panel');
    const promptInput = controlPanel.querySelector('input[type="text"]');
    const suggestionsContainer = controlPanel.querySelector('.suggestions-container');
    const refreshButton = document.getElementById('refresh-button');

    const recentPrompts = [];
    let selectedSuggestionIndex = null;

    function renderMessage(message) {
        const type = message.type;
        const report = message.report;

        const createElement = (tag, className, txt) => {
            const el = document.createElement(tag);
            if (className) {
                el.className = className;
            }
            if (txt !== undefined) {
                el.textContent = txt;
            }
            return el;
        };

        const messageElement = createElement('div', 'message-element p-4 rounded shadow');

        if (message.messageId){
            messageElement.id = message.messageId;
        }

        // Header: Sender, title & close button
        let senderHTML = `<span class="font-bold">${message.sender}</span>`;
        if (message.title) {
            senderHTML += `<span class="text-xs text-lighter ml-3">${message.title}</span>`;
        }
        const senderElement = document.createElement('div');
        senderElement.innerHTML = senderHTML;

        const closeButton = createElement('button', 'text-normal', '✖');
        closeButton.addEventListener('click', () => {
            messageElement.remove();
        });

        const messageHeader = createElement('div', 'flex justify-between items-center');
        messageHeader.append(senderElement, closeButton);
        messageElement.append(messageHeader);

        // Content
        const contentElement = createElement('div', 'message-content mt-3 mb-3');

        if (type === 'prompt') {
            let txt = '';
            if (message.rendered.system) {
                let sys = marked.marked(message.rendered.system);
                txt += `<div class="text-xs text-light mb-2"><b>System:</b><br>${sys}</div>`;
            }
            contentElement.innerHTML = txt + marked.marked(message.rendered.user);
        }
        else if (type === 'reply'){
            contentElement.innerHTML = marked.marked(message.reply);
        }


        if (type === 'prompt') {
            // Collapse code blocks
            contentElement.querySelectorAll('code.language-lean').forEach(codeBlock => {
                if (codeBlock) {
                    const collapsibleDiv = createElement('div', 'collapsible p-1 pl-2 cursor-pointer');
                    const clonedCodeBlock = codeBlock.cloneNode(true);
                    clonedCodeBlock.classList.add('code-hidden');
                    const placeholder = createElement('span', 'text-xs text-light', 'Expand code block.');
                    collapsibleDiv.appendChild(placeholder);
                    collapsibleDiv.addEventListener('click', evt => {
                        evt.stopPropagation();
                        clonedCodeBlock.classList.toggle('code-hidden');
                        placeholder.classList.toggle('hidden');
                    });
                    collapsibleDiv.appendChild(clonedCodeBlock);
                    codeBlock.parentNode.replaceChild(collapsibleDiv, codeBlock);
                }
            });

            // Add event listeners to all button.trigger-prompt-button
            contentElement.querySelectorAll('button.trigger-prompt-button').forEach(button => {
                button.addEventListener('click', () => {
                    const path = button.getAttribute('data-path');
                    vscode.postMessage({ command: 'render_prompt', prompt: message.prompt, path });
                });
            });

        } else if (type === 'reply') {
            // Every code block has small buttons below it (icons): Paste to editor, Copy to clipboard
            const codeBlocks = contentElement.querySelectorAll('code');
            for (let i = 0; i < codeBlocks.length; i++) {
                const codeBlock = codeBlocks[i];
                const codeBlockContainer = createElement('span', 'relative group');
                const codeBlockActions = createElement('span', 'space-x-2 p-1 hidden group-hover:flex');
                const pasteToEditor = createElement('button', 'text-sm', '📝');
                const undoButton = createElement('button', 'text-sm', '↩️');
                const copyClipboardButton = createElement('button', 'text-sm', '📋');
                const codeBlockClone = codeBlock.cloneNode(true);
        
                codeBlockActions.append(pasteToEditor, undoButton, copyClipboardButton);
                codeBlockContainer.append(codeBlockClone, codeBlockActions);
        
                // Add event listeners to the buttons
                copyClipboardButton.addEventListener('click', () => {
                    navigator.clipboard.writeText(codeBlockClone.textContent);
                });
        
                pasteToEditor.addEventListener('click', () => {
                    vscode.postMessage({ command: 'paste_to_editor', content: codeBlockClone.textContent });
                });
        
                undoButton.addEventListener('click', () => {
                    vscode.postMessage({ command: 'undo' });
                });
        
                // Replace the code block with the container
                codeBlock.parentNode.replaceChild(codeBlockContainer, codeBlock);
            }
        }

        messageElement.append(contentElement);

        messageElement.append(createElement('div', 'border-t border-gray-200 pt-1'));
        if (message.logUri) {
            const logLink = createElement('a', 'log-link text-sm hover:underline', 'View in log');
            logLink.addEventListener('click', event => {
                event.preventDefault();
                vscode.postMessage({ command: 'open_log', logUri: message.logUri });
            });
            const promptLink = createElement('a', 'log-link text-sm hover:underline ml-4', 'View prompt');
            promptLink.addEventListener('click', event => {
                event.preventDefault();
                const p = "file://" + message.prompt.path;
                vscode.postMessage({ command: 'open_log', logUri: p });
            });
            
            messageElement.append(logLink);
            messageElement.append(promptLink);
        }
        
        if (report && type === 'reply') {
            // Show the token usage and total cost
            const { costTotal } = report;
            const costTotalElement = createElement('div', 'flex justify-between items-center text-xs text-lighter mt-1');

            // Left side: Token usage and total cost
            let txt = `Token Usage: ${report.inTokens} | ${report.outTokens}`;
            if (message.showPrice) {
                txt += `<br>Total Cost: ${costTotal.toPrecision(2)} $`;
            }
            const leftSide = createElement('div');
            leftSide.innerHTML = txt;

            // Right side: Follow up button
            const rightSide = createElement('div');
            if (message.prompt && message.prompt.followUp && message.logUri) {
                const followUpButton = createElement('button', 'button-element px-2 py-1 rounded', 'Follow up');
                followUpButton.onclick = () => {
                    // Render the follow up prompt
                    const followUp = message.prompt.followUp || "";
                    vscode.postMessage({ command: 'render_prompt', prompt: message.prompt, path: followUp });
                };
                rightSide.appendChild(followUpButton);
            }
            costTotalElement.appendChild(leftSide);
            costTotalElement.appendChild(rightSide);
            messageElement.appendChild(costTotalElement);
        } else if (report) {
            // Show model options
            const { models } = report;

            const reportContainer = createElement('div', 'mt-2 grid gap-4');
            reportContainer.style.gridTemplateColumns = 'repeat(auto-fit, minmax(240px, 240px))';

            Array.isArray(models) && models.forEach(({ model, cost, tokenWarning }) => {
                // Run models: Each with description and a button
                const modelName = createElement('div', 'font-medium', model);
                const infoElement = createElement('div');
                infoElement.append(modelName);

                if (message.showPrice) {
                    const modelCost = createElement('div', 'text-xs text-light', `Input ≈ ${cost.toPrecision(2)} $`);
                    infoElement.append(modelCost);
                }

                if (tokenWarning) {
                    const warningElement = createElement('div', 'text-xs text-light mt-1', '⚠️ Exceeds token limit?');
                    infoElement.appendChild(warningElement);
                }

                const button = createElement('button', 'button-element px-3 py-1 text-white rounded h-full font-medium', 'Run');
                button.addEventListener('click', () => {
                    vscode.postMessage({ command: 'run_prompt', prompt: message.prompt, rendered: message.rendered, model});
                });

                const modelContainer = createElement('div', 'model-element flex items-center justify-between p-2 rounded');
                modelContainer.append(infoElement, button);
                reportContainer.appendChild(modelContainer);
            });


            messageElement.appendChild(reportContainer);
            if (type === 'prompt') {
                // Button: Show more model options
                const runWithOtherModelButton = createElement('button', 'button-element px-2 py-1 mt-3 rounded', 'See all models');
                runWithOtherModelButton.addEventListener('click', function() {
                    vscode.postMessage({ command: 'full_report', rendered: message.rendered, prompt: message.prompt });
                });
                messageElement.appendChild(runWithOtherModelButton);
            }
        }
        return messageElement;
    }

    function addMessage(msg) {
        chatView.appendChild(renderMessage(msg));

        if (chatView.childElementCount > MAX_CHAT_HISTORY) {
            chatView.removeChild(chatView.firstChild);
        }

        const el = chatView.lastElementChild;
        el.querySelectorAll('code').forEach((el) => {
            hljs.highlightElement(el);
        });

        requestAnimationFrame(() => {
            chatView.scrollTo({
                top: chatView.scrollHeight,
                behavior: 'smooth'
            });
        });
    }

    function createSuggestionItem(prompt) {
        const item = document.createElement('div');
        item.className = "suggestion-item p-2 border-2 rounded mb-2 cursor-pointer";

        item.innerHTML = `
            <div class="text-sm">${prompt.description}</div>
            <div class="text-xs text-lighter">${prompt.shortPath}</div>
        `;

        item.addEventListener('click', () => {
            addPromptToRecent(prompt);
            vscode.postMessage({ command: 'render_prompt', prompt });
            hideSuggestions();
        });

        return item;
    }

    function hideSuggestions() {
        suggestionsContainer.innerHTML = '';
        promptInput.value = '';
        suggestionsContainer.classList.add('hidden');
        selectedSuggestionIndex = null;
    }

    function showSuggestions() {
        suggestionsContainer.classList.remove('hidden');
    }

    function updateSuggestions(prompts) {
        suggestionsContainer.innerHTML = '';
        selectedSuggestionIndex = null;
        prompts.forEach(prompt => {
            suggestionsContainer.appendChild(createSuggestionItem(prompt));
        });
        showSuggestions();
    }

    // Prompt history
    function addPromptToRecent(prompt) {
        const existingIndex = recentPrompts.findIndex(item => item.path === prompt.path);
        if (existingIndex !== -1) {
            recentPrompts.splice(existingIndex, 1);
        }
        recentPrompts.push(prompt);
        if (recentPrompts.length > MAX_PROMPT_HISTORY) {
            recentPrompts.shift();
        }
    }

    function highlightSuggestion(index) {
        if (index === null) return;
        Array.from(suggestionsContainer.children).forEach((item, idx) => {
            if (idx === index) {
                item.classList.add("suggestion-selected");
            }
            else {
                item.classList.remove("suggestion-selected");
            }
        });
    }

    const navigateSuggestions = (direction) => {
        if (suggestionsContainer.childElementCount === 0 && recentPrompts.length > 0) {
            updateSuggestions(recentPrompts);
            selectedSuggestionIndex = direction === -1 ? recentPrompts.length - 1 : 0;
        } else if (suggestionsContainer.childElementCount > 0) {
            selectedSuggestionIndex = (selectedSuggestionIndex + direction + suggestionsContainer.childElementCount) % suggestionsContainer.childElementCount;
        }
        highlightSuggestion(selectedSuggestionIndex);
    };
    
    promptInput.addEventListener('keydown', (e) => {
        const { key } = e;
        if (key === 'ArrowUp' || key === 'ArrowDown') {
            e.preventDefault();
            navigateSuggestions(key === 'ArrowUp' ? -1 : 1);
        } else if (key === 'Enter') {
            e.preventDefault();
            if (selectedSuggestionIndex !== null && suggestionsContainer.childElementCount > 0) {
                suggestionsContainer.children[selectedSuggestionIndex].click();
            }
        } else if (key === 'Escape') {
            hideSuggestions();
        }
    });

    promptInput.addEventListener('input', () => {
        const input = promptInput.value;
        selectedSuggestionIndex = null;
        if (input) {
            vscode.postMessage({command: 'search_prompt', input});
        } else {
            suggestionsContainer.innerHTML = '';
            suggestionsContainer.classList.add('hidden');
        }
    });

    promptInput.addEventListener('focus', () => {
        if (!promptInput.value) {
            const input = "";
            vscode.postMessage({command: 'search_prompt', input});
        }
    });

    promptInput.addEventListener('blur', () => {
        setTimeout(() => {
            if (!document.activeElement || document.activeElement !== promptInput) {
                hideSuggestions();
            }
        }, 100);
    });

    // Refresh button
    refreshButton.addEventListener('click', () => {
        vscode.postMessage({ command: 'refresh_scribe' });
    });

    // Handle messages from the extension
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'set_hljs_theme':
                const linkElement = document.getElementById('hljs-theme');
                const themeUrl = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/";
                linkElement.href = themeUrl + message.theme + '.css';
                break;
            case 'add_message':
                addMessage(message.message);
                break;
            case 'update_message':
                // Change the content of a reply (streaming)
                const messageElement = document.getElementById(message.message.messageId);
                const contentElement = messageElement.querySelector('.message-content');
                contentElement.innerHTML = marked.marked(message.message.reply);
                contentElement.querySelectorAll('code').forEach((el) => {
                    hljs.highlightElement(el);
                });
                break;
            case 'replace_message':
                // Replace the full reply (final)
                const messageElement2 = document.getElementById(message.message.messageId);
                const el = renderMessage(message.message);
                el.querySelectorAll('code').forEach((el) => {
                    hljs.highlightElement(el);
                });
                messageElement2.replaceWith(el);
                break;
            case 'update_suggestions':
                updateSuggestions(message.prompts);
                break;
        }
    });
})();