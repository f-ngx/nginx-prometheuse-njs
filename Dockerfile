FROM nginx:1.29-alpine

# Модуль njs уже входит в официальный образ, ставить ничего не нужно
COPY nginx/ /etc/nginx/
COPY src/ /etc/nginx/src/

RUN nginx -t
