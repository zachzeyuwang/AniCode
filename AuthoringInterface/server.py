from flask import Flask, render_template, redirect, url_for, request, flash, send_from_directory, abort
from werkzeug.utils import secure_filename
import cv2
import os
# import zxing
# below is to import zxing from absolute path
import importlib.util
import sys
spec = importlib.util.spec_from_file_location("zxing", "/usr/local/lib/python3.6/dist-packages/zxing/__init__.py")
zxing = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = zxing
spec.loader.exec_module(zxing)

app = Flask(__name__)
# cors = CORS(app)
# app.config["CORS_HEADERS"] = "Content-Type"

@app.route("/")
def index():
	return render_template("index.html")
@app.route("/reference")
def reference():
	return render_template("reference.html")
@app.route("/upload")
def upload():
	return render_template("upload.html")
@app.route("/authoring", methods=["GET", "POST"])
def authoring():
	if request.method == "POST":
		foldername = "userdata_" + request.remote_addr + "/"
		os.system("mkdir %s" % foldername)
		filename = "test.jpg"
		if "img" not in request.files:
			os.system("cp test.jpg %s" % foldername)
		else:
			file = request.files["img"]
			if file.filename == "":
				os.system("cp test.jpg %s" % foldername)
			elif file:
				filename = secure_filename(file.filename)
				file.save(foldername + filename)
		img = cv2.imread(foldername + filename)
		# crop to 4:3
		h, w = img.shape[:2]
		if w > 4*h/3:
			img = img[:, int((w-4*h/3)/2) : int((w-4*h/3)/2 + 4*h/3)]
		else:
			img = img[int((h-3*w/4)/2) : int((h-3*w/4)/2 + 3*w/4), :]
		cv2.imwrite(foldername + "img_author.png", img)
		# detect QR code
		reader = zxing.BarCodeReader()
		barcode = reader.decode(foldername + "img_author.png", try_harder=True)
		if barcode is None:
			flash("Reference QR undetectable! Please print a bigger QR code and take the picture again.")
			return redirect(url_for("upload"))
		qrpoints = [barcode.points[0][0], barcode.points[0][1], barcode.points[1][0], barcode.points[1][1], barcode.points[2][0], barcode.points[2][1], barcode.points[3][0], barcode.points[3][1]]
		# resize to 640x480
		h = img.shape[0]
		ratio = h / 480
		qrpoints = [str(round(qrpoint / ratio)) for qrpoint in qrpoints]
		img = cv2.resize(img, (640, 480))
		cv2.imwrite(foldername + "img_author.png", img)
		os.system("cp ./AniCode-cpp/segment ./%s" % foldername)
		os.system("cp ./AniCode-cpp/match ./%s" % foldername)
		os.system("cp ./AniCode-cpp/animate ./%s" % foldername)
		os.system("cd %s && ./segment img_author.png" % foldername)
		return render_template("authoring.html", qr_landmarks=" ".join(qrpoints))
	return redirect("upload")
@app.route("/finish", methods=["GET", "POST"])
def finish():
	if request.method == "POST":
		authored_qr = request.form.get("authored_qr")
		foldername = "userdata_" + request.remote_addr + "/"
		with open(foldername + "qr.txt", "w") as qrfile:
			qrfile.write(authored_qr)
		os.system("cd %s && ./match img_author.png qr.txt" % foldername)
		os.system("cd %s && ./animate img_author.png qr.txt dst_video.avi" % foldername)
		return render_template("finish.html", authored_qr=authored_qr)
	return redirect("upload")

@app.route("/get_userdata")
def get_userdata():
	if "file" not in request.args:
		abort(404)
	return send_from_directory("./userdata_%s/" % request.remote_addr, request.args.get('file'))

if __name__ == "__main__":
	app.run(host="0.0.0.0", threaded=True, debug=True, port=2018)
