//
//  authorCapture.cpp
//  QRCode-cpp
//
//  Created by wangzeyu on 10/24/17.
//  Copyright © 2017 wangzeyu. All rights reserved.
//

#include <string>
#include <exception>
#include <stdlib.h>
#include <fstream>
#include <zxing/common/Counted.h>
#include <zxing/Binarizer.h>
#include <zxing/MultiFormatReader.h>
#include <zxing/Result.h>
#include <zxing/ReaderException.h>
#include <zxing/common/GlobalHistogramBinarizer.h>
#include <zxing/Exception.h>
#include <zxing/common/IllegalArgumentException.h>
#include <zxing/BinaryBitmap.h>
#include <zxing/DecodeHints.h>
#include <zxing/qrcode/QRCodeReader.h>
#include <zxing/MultiFormatReader.h>
#include <zxing/MatSource.h>
#include <opencv2/core/core.hpp>
#include <opencv2/highgui/highgui.hpp>
#include <opencv2/imgproc/imgproc.hpp>

#include "authorCapture.hpp"
#include "utils.hpp"

using namespace zxing;
using namespace zxing::qrcode;
using namespace cv;

bool authorCapture(string write_img_file, string write_qrpos_file) {
    int deviceId = 0;
    int captureWidth = 640;
    int captureHeight = 480;
    bool multi = false;
    bool isDetected = false;
    Point2f landmarks[4];
    
    // Log
    cout << "Capturing from device " << deviceId << "..." << endl;
    
    // Open video captire
    VideoCapture videoCapture(deviceId);
    
    if (!videoCapture.isOpened()) {
        
        // Log
        cerr << "Open video capture failed on device id: " << deviceId << endl;
        return false;
        
    }
    
    if (!videoCapture.set(CV_CAP_PROP_FRAME_WIDTH, captureWidth)) {
        
        // Log
        cerr << "Failed to set frame width: " << captureWidth << " (ignoring)" << endl;
        
    }
    
    if (!videoCapture.set(CV_CAP_PROP_FRAME_HEIGHT, captureHeight)) {
        
        // Log
        cerr << "Failed to set frame height: " << captureHeight << " (ignoring)" << endl;
        
    }
    
    // The captured image and its grey conversion
    Mat image, grey, frame;
    
    // Open output window
    namedWindow("Author Capturing (Press c)", cv::WINDOW_AUTOSIZE);
    
    // Stopped flag will be set to -1 from subsequent wayKey() if no key was pressed
    int stopped = -1;
    
    while (stopped != 'c') {
        // Capture image
        bool result = videoCapture.read(image);
        isDetected = false;
        if (result) {
            
            // Convert to grayscale
            cvtColor(image, grey, CV_BGR2GRAY);
            frame = image.clone();
            
            try {
                
                // Create luminance  source
                Ref<LuminanceSource> source = MatSource::create(grey);
                
                // Search for QR code
                Ref<Reader> reader;
                
                if (multi) {
                    reader.reset(new MultiFormatReader);
                } else {
                    reader.reset(new QRCodeReader);
                }
                
                Ref<Binarizer> binarizer(new GlobalHistogramBinarizer(source));
                Ref<BinaryBitmap> bitmap(new BinaryBitmap(binarizer));
                Ref<Result> result(reader->decode(bitmap, DecodeHints(DecodeHints::TRYHARDER_HINT)));
                
                // Get result point count
                int resultPointCount = result->getResultPoints()->size();
                
                // QR code detected
                if (resultPointCount == 4) {
                    isDetected = true;
                    for (int j = 0; j < resultPointCount; j++) {
                        // Save points to landmarks
                        landmarks[j] = toCvPoint(result->getResultPoints()[j]);
                        // Draw circles around landmarks
                        circle(frame, landmarks[j], 10, Scalar(110, 220, 0), 2);
                        // Get start result point
                        Ref<ResultPoint> previousResultPoint = (j > 0) ? result->getResultPoints()[j - 1] : result->getResultPoints()[resultPointCount - 1];
                        // Draw line
                        line(frame, toCvPoint(previousResultPoint), toCvPoint(result->getResultPoints()[j]), Scalar(110, 220, 0),  2, 8 );
                        // Update previous point
                        previousResultPoint = result->getResultPoints()[j];
                    }
                    
                } else {
                    // Keep capturing if QR code is not detectable
                    isDetected = false;
                }
                
            } catch (const ReaderException& e) {
                //                cerr << e.what() << " (ignoring)" << endl;
            } catch (const zxing::IllegalArgumentException& e) {
                //                cerr << e.what() << " (ignoring)" << endl;
            } catch (const zxing::Exception& e) {
                //                cerr << e.what() << " (ignoring)" << endl;
            } catch (const std::exception& e) {
                //                cerr << e.what() << " (ignoring)" << endl;
            }
            
            // Show captured image
            imshow("Author Capturing (Press c)", frame);
            
            // Wait a key for 1 millis
            stopped = waitKey(1);
            if (!isDetected) {
                stopped = -1;
                cout << "Keep capturing if QR code is not detectable\n";
                continue;
            } else if (stopped == 'c' && isDetected) {
                imwrite(write_img_file, image);
                ofstream fout(write_qrpos_file);
                for (int j = 0; j < 4; j++) {
                    fout << landmarks[j].x << ' ' << landmarks[j].y << endl;
                }
                fout.close();
                imwrite("qr_" + write_img_file, frame);
            }
            
        } else {
            
            // Log
            cerr << "video capture failed" << endl;
            
        }
        
    }
    
    // Release video capture
    videoCapture.release();
    return true;
}
