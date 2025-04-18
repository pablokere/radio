import os
from dotenv import load_dotenv

# Cargar variables de entorno desde el archivo .env
load_dotenv()

class Config:
    # Radio del chat en metros (por defecto 1000m = 1km)
    CHAT_RADIUS = int(os.getenv('CHAT_RADIUS', 1000))
    
    # Configuración del servidor
    HOST = os.getenv('HOST', '0.0.0.0')
    PORT = int(os.getenv('PORT', 443))
    
    # Configuración de WebSocket
    PING_INTERVAL = int(os.getenv('PING_INTERVAL', 30))  # 30 segundos
    PONG_TIMEOUT = int(os.getenv('PONG_TIMEOUT', 10))  # 10 segundos
    MAX_RECONNECT_ATTEMPTS = int(os.getenv('MAX_RECONNECT_ATTEMPTS', 5)) 
