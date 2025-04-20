import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getDistance } from 'geolib';
import 'leaflet/dist/leaflet.css';
import { CONFIG } from '../config';

// Agregar este componente antes del Chat
function MapCenter({ position }) {
  const map = useMap();
  useEffect(() => {
    map.setView(position, map.getZoom());
  }, [position, map]);
  return null;
}

function Chat() {
  const location = useLocation();
  const username = location.state?.username;
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [position, setPosition] = useState(null);
  const [clientId, setClientId] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const wsRef = useRef(null);
  const messageEndRef = useRef(null);
  const connectionAttempts = useRef(0);
  const positionRef = useRef(position);
  const [allMessages, setAllMessages] = useState([]);
  const [filteredMessages, setFilteredMessages] = useState([]);
  const [isFirstLocationSent, setIsFirstLocationSent] = useState(false);
  const navigate = useNavigate();

  // Coordenadas por defecto: Paloma 715, Córdoba, Argentina
  const DEFAULT_COORDINATES = [-31.3740, -64.2852]; // Kiosko 10

  // Actualizar la ref cuando cambia position
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  // Efecto para monitorear cambios de posición (solo actualiza el estado)
  useEffect(() => {
    console.log('Setting up geolocation monitoring...');
    
    // Get initial position
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('Got initial position:', position.coords);
        setPosition([position.coords.latitude, position.coords.longitude]);
        setLocationError(null);
      },
      (error) => {
        console.error('Error getting initial location:', error);
        setPosition(DEFAULT_COORDINATES);
        setLocationError('Error al obtener ubicación GPS. Usando ubicación por defecto.');
      }
    );

    // Watch position changes
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        console.log('Position changed:', position.coords);
        setPosition([position.coords.latitude, position.coords.longitude]);
        setLocationError(null);
      },
      (error) => {
        console.error('Error watching location:', error);
        setPosition(DEFAULT_COORDINATES);
        setLocationError('Error al obtener ubicación GPS. Usando ubicación por defecto.');
      }
    );

    return () => {
      console.log('Cleaning up geolocation monitoring');
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const connectWebSocket = useCallback(() => {
    console.log('Attempting to create WebSocket connection...');
    
    // Verificar que tenemos los datos necesarios
    if (!position || !username) {
      console.log('Waiting for position and username before connecting:', {
        hasPosition: !!position,
        hasUsername: !!username
      });
      return;
    }
    
    // Si ya hay una conexión activa, no crear una nueva
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    try {
      console.log('Creating WebSocket connection to:', CONFIG.WS_URL);
      
      const ws = new WebSocket(CONFIG.WS_URL);
      wsRef.current = ws;
      console.log('WebSocket instance created');

      let reconnectTimeout;
      connectionAttempts.current = 0;

      ws.onopen = () => {
        console.log('WebSocket connection established successfully');
        setIsConnected(true);
        connectionAttempts.current = 0;
        
        // Solo enviar connect si no tenemos client_id (primera conexión o reconexión)
        if (!clientId) {
          const connectMessage = {
            type: 'connect',
            username,
            lat: position[0],
            lon: position[1]
          };
          console.log('Sending connect message:', connectMessage);
          try {
            ws.send(JSON.stringify(connectMessage));
          } catch (error) {
            console.error('Error sending connect message:', error);
            ws.close();
          }
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received WebSocket message:', data);
          
          switch (data.type) {
            case 'connected':
              console.log('Setting client_id:', data.client_id);
              setClientId(data.client_id);
              setIsConnected(true);
              console.log('Server response - connected:', {
                client_id: data.client_id,
                status: 'connected'
              });
              break;
            case 'users_in_range':
              console.log('Server response - users in range:', {
                users: data.users,
                count: data.users.length
              });
              setUsers(data.users);
              break;
            case 'messages_history':
              console.log('Server response - message history:', {
                message_count: data.messages.length
              });
              setAllMessages(data.messages);
              if (positionRef.current) {
                const filteredMessages = data.messages.filter(msg => {
                  const distance = getDistance(
                    { latitude: positionRef.current[0], longitude: positionRef.current[1] },
                    { latitude: msg.lat, longitude: msg.lon }
                  );
                  return distance <= CONFIG.CHAT_RADIUS;
                });
                console.log('Filtered history messages:', filteredMessages.length);
                setFilteredMessages(filteredMessages);
              }
              break;
            case 'new_message':
              console.log('=== NEW MESSAGE RECEIVED ===');
              console.log('Full message data:', data);
              
              if (data.message.client_id === clientId) {
                console.log('Ignoring message from self');
                console.log('=== END NEW MESSAGE ===');
                break;
              }
              
              console.log('Message content:', data.message.content);
              console.log('From user:', data.message.username);
              console.log('Location:', {
                lat: data.message.lat,
                lon: data.message.lon
              });
              console.log('Timestamp:', new Date(data.message.timestamp).toLocaleString());
              
              setAllMessages(prev => {
                console.log('Previous allMessages count:', prev.length);
                const newMessages = [...prev, data.message];
                console.log('New allMessages count:', newMessages.length);
                return newMessages;
              });
              
              if (positionRef.current) {
                const distance = getDistance(
                  { latitude: positionRef.current[0], longitude: positionRef.current[1] },
                  { latitude: data.message.lat, longitude: data.message.lon }
                );
                console.log('Distance to message:', distance, 'meters');
                if (distance <= CONFIG.CHAT_RADIUS) {
                  setFilteredMessages(prev => {
                    console.log('Previous filteredMessages count:', prev.length);
                    const newFiltered = [...prev, data.message];
                    console.log('New filteredMessages count:', newFiltered.length);
                    return newFiltered;
                  });
                  console.log('Message added to filtered messages');
                } else {
                  console.log('Message outside range, not showing');
                }
              } else {
                console.log('No position available for distance check');
              }
              console.log('=== END NEW MESSAGE ===');
              break;
            case 'error':
              console.error('Server response - error:', {
                message: data.message
              });
              break;
            default:
              console.warn('Server response - unknown message type:', {
                type: data.type,
                full_message: data
              });
              break;
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', {
            error: error.message,
            raw_data: event.data
          });
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket connection closed:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          timestamp: new Date().toISOString()
        });
        
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
        }
        
        setIsConnected(false);
        
        // Intentar reconectar solo si no fue un cierre limpio o si fue un cierre anormal
        if (!event.wasClean || event.code === 1006) { // 1006 es ABNORMAL_CLOSURE
          if (connectionAttempts.current < 5) {
            const delay = Math.min(1000 * Math.pow(2, connectionAttempts.current), 30000);
            console.log(`Attempting to reconnect in ${delay/1000} seconds (attempt ${connectionAttempts.current + 1}/5)`);
            
            reconnectTimeout = setTimeout(() => {
              connectionAttempts.current++;
              connectWebSocket();
            }, delay);
          } else {
            console.log('Max reconnection attempts reached');
            // Si llegamos al máximo de intentos, redirigir al login
            navigate('/');
          }
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', {
          error: error,
          readyState: ws.readyState,
          url: ws.url
        });
        // No cerrar la conexión aquí, dejar que onclose maneje la reconexión
      };

    } catch (error) {
      console.error('Error creating WebSocket:', {
        error: error.message,
        stack: error.stack
      });
      setIsConnected(false);
    }
  }, [username, position, clientId, navigate]);

  // Solo conectar cuando tenemos la posición inicial y el username
  useEffect(() => {
    if (position && username && !wsRef.current) {
      console.log('Initial position and username available, attempting to connect');
      connectWebSocket();
    } else if (!wsRef.current) {
      console.log('Not connecting:', {
        reason: !position ? 'No position' : !username ? 'No username' : 'Already connected'
      });
    }
  }, [position, username]); // Solo dependemos de la posición inicial y username

  const handlePeriodicUpdate = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !clientId) {
      console.log('Skipping update - WebSocket not ready');
      return;
    }

    // Solo enviar posición al servidor
    const locationMessage = {
      type: 'sent_location',
      client_id: clientId,
      lat: positionRef.current[0],
      lon: positionRef.current[1]
    };
    console.log('Sending periodic location update:', locationMessage);
    try {
      wsRef.current.send(JSON.stringify(locationMessage));
    } catch (error) {
      console.error('Error sending location update:', error);
    }

    // Filtrar mensajes basados en la posición actual
    if (allMessages.length > 0) {
      console.log('Filtering messages based on position:', {
        currentPosition: positionRef.current,
        totalMessages: allMessages.length
      });
      const filteredMessages = allMessages.filter(msg => {
        const distance = getDistance(
          { latitude: positionRef.current[0], longitude: positionRef.current[1] },
          { latitude: msg.lat, longitude: msg.lon }
        );
        return distance <= CONFIG.CHAT_RADIUS;
      });
      console.log('Filtered messages:', filteredMessages.length);
      setFilteredMessages(filteredMessages);
    }
  }, [clientId]);

  // Efecto para solicitar el historial de mensajes solo una vez al inicio
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && clientId && positionRef.current && !isFirstLocationSent) {
      console.log('Requesting message history for the first time');
      const historyRequest = {
        type: 'get_history_messages',
        client_id: clientId,
        lat: positionRef.current[0],
        lon: positionRef.current[1]
      };
      wsRef.current.send(JSON.stringify(historyRequest));
      setIsFirstLocationSent(true);
    }
  }, [clientId, isFirstLocationSent]);

  // Efecto para manejar las actualizaciones periódicas
  useEffect(() => {
    if (!positionRef.current || !clientId) {
      console.log('Waiting for position and clientId before setting up periodic updates');
      return;
    }

    console.log('Setting up periodic updates');
    
    // Ejecutar inmediatamente
    handlePeriodicUpdate();

    // Configurar el intervalo usando la configuración
    const interval = setInterval(handlePeriodicUpdate, CONFIG.LOCATION_UPDATE_INTERVAL);

    return () => {
      console.log('Cleaning up periodic updates');
      clearInterval(interval);
    };
  }, [clientId]);

  // Efecto para scroll al final de los mensajes
  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'end'
      });
    }
  }, [filteredMessages]);

  // Efecto adicional para scroll inmediato cuando hay nuevos mensajes
  useEffect(() => {
    if (messageEndRef.current) {
      const messagesContainer = messageEndRef.current.parentElement;
      const isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop <= messagesContainer.clientHeight + 100;
      
      if (isNearBottom) {
        messageEndRef.current.scrollIntoView({ 
          behavior: 'auto',
          block: 'end'
        });
      }
    }
  }, [filteredMessages.length]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (message.trim() && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const messageData = {
        type: 'sent_message',
        client_id: clientId,
        content: message,
        lat: position[0],
        lon: position[1],
        username: username,
        timestamp: Date.now()
      };
      console.log('Sending message:', messageData);
      
      // Agregar el mensaje inmediatamente a allMessages y filteredMessages
      const newMessage = {
        ...messageData,
        client_id: clientId
      };
      setAllMessages(prev => [...prev, newMessage]);
      setFilteredMessages(prev => [...prev, newMessage]);
      
      wsRef.current.send(JSON.stringify(messageData));
      setMessage('');

      // Scroll inmediato después de enviar mensaje
      setTimeout(() => {
        if (messageEndRef.current) {
          messageEndRef.current.scrollIntoView({ 
            behavior: 'auto',
            block: 'end'
          });
        }
      }, 100);
    } else {
      console.log('Cannot send message:', {
        hasMessage: !!message.trim(),
        isWebSocketOpen: wsRef.current?.readyState === WebSocket.OPEN,
        clientId: clientId
      });
    }
  };

  // Efecto para manejar el cierre de la pestaña
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && clientId) {
        console.log('Sending disconnect message before closing');
        try {
          wsRef.current.send(JSON.stringify({
            type: 'disconnect',
            client_id: clientId
          }));
        } catch (error) {
          console.error('Error sending disconnect message:', error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [clientId]);

  // Función para generar un color basado en el username
  const getUserColor = (username) => {
    const colors = [
      '#005c4b', // Verde WhatsApp
      '#202c33', // Gris oscuro
      '#2a3942', // Gris medio
      '#374045', // Gris claro
      '#00a884', // Verde claro
      '#8696a0', // Gris azulado
    ];
    const index = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[index % colors.length];
  };

  if (!position) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#fafafa',
        flexDirection: 'column',
        gap: '20px',
        padding: '20px'
      }}>
        {locationError ? (
          <div style={{
            color: '#ed4956',
            textAlign: 'center',
            maxWidth: '300px'
          }}>
            {locationError}
          </div>
        ) : (
          <div>Obteniendo tu ubicación...</div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      height: '-webkit-fill-available', // Para Chrome mobile
      backgroundColor: '#111b21',
      color: '#e9edef',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      position: 'fixed', // Para evitar scroll en mobile
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px',
        backgroundColor: '#202c33',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        height: '60px' // Altura fija para el header
      }}>
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <button
            onClick={() => setShowMap(!showMap)}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            <div style={{
              width: '20px',
              height: '2px',
              backgroundColor: '#e9edef',
              borderRadius: '1px'
            }} />
            <div style={{
              width: '20px',
              height: '2px',
              backgroundColor: '#e9edef',
              borderRadius: '1px'
            }} />
            <div style={{
              width: '20px',
              height: '2px',
              backgroundColor: '#e9edef',
              borderRadius: '1px'
            }} />
          </button>
          <div style={{ 
            fontWeight: '600',
            fontSize: '17px',
            color: '#e9edef',
            letterSpacing: '-0.3px'
          }}>
            {showMap ? 'Mapa' : 'Chat'}
          </div>
        </div>
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <div style={{ 
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: isConnected ? CONFIG.COLORS.CONNECTED : CONFIG.COLORS.DISCONNECTED
          }} />
          <div style={{ 
            color: isConnected ? CONFIG.COLORS.CONNECTED : CONFIG.COLORS.DISCONNECTED,
            fontSize: '13px',
            fontWeight: '500'
          }}>
            {isConnected ? 'Conectado' : 'Desconectado'}
          </div>
          <div style={{
            color: '#8696a0',
            fontSize: '13px',
            fontWeight: '500',
            marginLeft: '8px'
          }}>
            {users.length} {users.length === 1 ? 'usuario' : 'usuarios'} en MeRadio
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
        height: 'calc(100% - 60px)' // Restamos la altura del header
      }}>
        {/* Chat View */}
        {!showMap && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            padding: '16px',
            overflow: 'hidden',
            position: 'relative'
          }}>
            {/* Messages */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingBottom: '16px',
              paddingTop: '8px',
              WebkitOverflowScrolling: 'touch' // Mejor scroll en iOS
            }}>
              {filteredMessages.map((msg, index) => {
                const userColor = getUserColor(msg.username);
                return (
                  <div
                    key={index}
                    style={{
                      maxWidth: '85%',
                      alignSelf: msg.client_id === clientId ? 'flex-end' : 'flex-start',
                      display: 'flex',
                      alignItems: 'flex-end',
                      gap: '8px',
                      marginBottom: '4px'
                    }}
                  >
                    {msg.client_id !== clientId && (
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: userColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#e9edef',
                        fontSize: '14px',
                        fontWeight: '600',
                        flexShrink: 0
                      }}>
                        {msg.username[0].toUpperCase()}
                      </div>
                    )}
                    <div style={{
                      backgroundColor: msg.client_id === clientId ? CONFIG.COLORS.USER_MESSAGE : userColor,
                      color: '#e9edef',
                      padding: '6px 7px 8px 9px',
                      borderRadius: '7.5px',
                      fontSize: '14.2px',
                      boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)',
                      position: 'relative',
                      lineHeight: '1.3',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        alignItems: 'flex-end',
                        gap: '8px'
                      }}>
                        <div style={{ 
                          maxWidth: 'calc(100% - 50px)',
                          wordBreak: 'break-word',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {msg.content}
                        </div>
                        <div style={{ 
                          fontSize: '11px',
                          color: 'rgba(233, 237, 239, 0.6)',
                          whiteSpace: 'nowrap',
                          marginTop: '2px'
                        }}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messageEndRef} />
            </div>

            {/* Message Input */}
            <div style={{
              padding: '12px 0',
              backgroundColor: 'transparent',
              position: 'sticky',
              bottom: 0,
              zIndex: 100
            }}>
              <form onSubmit={sendMessage} style={{ 
                display: 'flex',
                gap: '8px'
              }}>
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Mensaje..."
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '15px',
                    outline: 'none',
                    backgroundColor: '#2a3942',
                    color: '#e9edef',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                    letterSpacing: '-0.2px'
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#00a884',
                    color: '#111b21',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '15px',
                    opacity: message.trim() ? 1 : 0.5,
                    transition: 'all 0.2s',
                    letterSpacing: '-0.2px'
                  }}
                  disabled={!message.trim()}
                >
                  Enviar
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Map View */}
        {showMap && (
          <div style={{ 
            flex: 1,
            position: 'relative',
            height: '100%',
            overflow: 'hidden'
          }}>
            <MapContainer
              center={position}
              zoom={15}
              style={{ height: '100%', width: '100%' }}
            >
              <MapCenter position={position} />
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              {/* User's position marker */}
              <Marker
                position={position}
                icon={L.divIcon({
                  className: 'custom-div-icon',
                  html: `<div style="background-color: #00a884; 
                         color: #111b21; 
                         padding: 8px; 
                         border-radius: 50%; 
                         width: 36px; 
                         height: 36px; 
                         display: flex; 
                         align-items: center; 
                         justify-content: center;
                         font-weight: 600;
                         font-family: 'Inter', sans-serif;
                         box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${username[0].toUpperCase()}</div>`
                })}
              >
                <Popup>
                  Tú ({username})
                </Popup>
              </Marker>
              {/* Other users markers */}
              {users.map(user => (
                <Marker
                  key={user.client_id}
                  position={[user.lat, user.lon]}
                  icon={L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div style="background-color: #202c33; 
                           color: #e9edef; 
                           padding: 8px; 
                           border-radius: 50%; 
                           width: 36px; 
                           height: 36px; 
                           display: flex; 
                           align-items: center; 
                           justify-content: center;
                           font-weight: 600;
                           font-family: 'Inter', sans-serif;
                           box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${user.username[0].toUpperCase()}</div>`
                  })}
                >
                  <Popup>
                    {user.username} ({Math.round(getDistance(
                      { latitude: position[0], longitude: position[1] },
                      { latitude: user.lat, longitude: user.lon }
                    ))}m)
                  </Popup>
                </Marker>
              ))}
              {/* Range circle */}
              <Circle
                center={position}
                radius={CONFIG.CHAT_RADIUS}
                pathOptions={{
                  color: CONFIG.COLORS.CONNECTED,
                  fillColor: CONFIG.COLORS.CONNECTED,
                  fillOpacity: 0.1
                }}
              />
            </MapContainer>
          </div>
        )}
      </div>
    </div>
  );
}

export default Chat; 