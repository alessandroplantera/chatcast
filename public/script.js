let selectedChat;


// Function to fetch messages from the server
    async function fetchMessages() {
      try {
        const response = await fetch('/messages');
        if (!response.ok) {
          throw new Error('Failed to fetch messages');
        }

        const messages = await response.json();

        const messageContainer = document.getElementById('message-container');
        messageContainer.innerHTML = ''; // Clear the current messages

        messages.forEach(message => {
          const messageElement = document.createElement('div');
          messageElement.innerHTML = `
            <strong>${message.chat_id} ${message.username}</strong> (${message.date}): ${message.message} 
          `;
          messageContainer.appendChild(messageElement);
        });
      } catch (error) {
        console.error('Error fetching messages:', error);
      }
    }

    async function fetchChatIds() {
          try {
            const response = await fetch('/chat_ids');
            const chatIds = await response.json();

            const container = document.getElementById('chat-list-container');
            chatIds.forEach(chatId => {
              const chatElement = document.createElement('div');
              chatElement.className = 'chat';
              chatElement.innerHTML = `<a class="chatListItem" data-chatId="${chatId}">Chat ID: ${chatId}</a>`;
              container.appendChild(chatElement);
            });
          } catch (error) {
            console.error('Error fetching chat IDs:', error);
          }
        }

 async function fetchChatSessions() {
          try {
            const response = await fetch('/sessions');
            const chatSessions = await response.json();

            const container = document.getElementById('chat-sessions-container');
            chatSessions.forEach(chatId => {
              const chatElement = document.createElement('div');
              chatElement.className = 'chat';
              chatElement.innerHTML = `<a class="chatListItem" data-chatId="${chatId}">Chat ID: ${chatId}</a>`;
              container.appendChild(chatElement);
            });
          } catch (error) {
            console.error('Error fetching chat IDs:', error);
          }
        }


