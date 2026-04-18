import os
from flask import Flask, request, jsonify, render_template
from werkzeug.utils import secure_filename
from utils.ocr import process_order_image

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB
app.config['UPLOAD_FOLDER'] = '/tmp/ocr_uploads'

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'}

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/ocr', methods=['POST'])
def ocr():
    if 'image' not in request.files:
        return jsonify({'error': 'Няма качено изображение'}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'Не е избран файл'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': 'Неподдържан формат. Използвайте JPG, PNG или WEBP'}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    try:
        result = process_order_image(filepath)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': f'Грешка при обработка: {str(e)}'}), 500
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
