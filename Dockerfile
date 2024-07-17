FROM node:alpine

RUN apk add --no-cache python3 g++ make
RUN npm i -g gradio-bot

ENTRYPOINT ["gradio-bot"]
