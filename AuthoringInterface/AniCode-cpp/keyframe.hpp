//
//  keyframe.hpp
//  QRCode-cpp
//
//  Created by wangzeyu on 10/28/17.
//  Copyright © 2017 wangzeyu. All rights reserved.
//

#ifndef keyframe_hpp
#define keyframe_hpp

#include <opencv2/opencv.hpp>
#include <vector>
using namespace std;
using namespace cv;

enum KeyframeType{TRANSFORM2D, TRANSFORM3D, COLOR, ANNOTATION, TRANSFORM2D2, TRANSFORM3D2, COLOR2};

const int fps = 30;

class Keyframe {
public:
    float duration;
    int type;
};

class KeyframeTransform2D : public Keyframe {
public:
    float translation_x, translation_y, rotation;
    KeyframeTransform2D(float translation_x_, float translation_y_, float rotation_, float duration_, int type_) {
        translation_x = translation_x_;
        translation_y = translation_y_;
        rotation = rotation_;
        duration = duration_;
        type = type_;
    }
};

class KeyframeTransform3D : public Keyframe {
public:
    Point2f ptp[4], ptq[4];
    KeyframeTransform3D(Point2f* ptp_, Point2f* ptq_, float duration_, int type_) {
        ptp[0] = ptp_[0]; ptp[1] = ptp_[1]; ptp[2] = ptp_[2]; ptp[3] = ptp_[3];
        ptq[0] = ptq_[0]; ptq[1] = ptq_[1]; ptq[2] = ptq_[2]; ptq[3] = ptq_[3];
        duration = duration_;
        type = type_;
    }
};

class KeyframeColor : public Keyframe {
public:
    float delta_hue;
    KeyframeColor(float delta_hue_, float duration_, int type_) {
        delta_hue = delta_hue_;
        duration = duration_;
        type = type_;
    }
};

class KeyframeAnnotation : public Keyframe {
public:
    string annotation;
    KeyframeAnnotation(string annotation_, float duration_, int type_) {
        annotation = annotation_;
        duration = duration_;
        type = type_;
    }
};

vector<Keyframe*> decode_keyframes(string decoded_qr);

void add_keyframe(Mat& old_inpainted, Mat& src, Keyframe* curr_frame, VideoWriter& vout, int keyframe_id, string directory, string mask_prefix);

#endif /* keyframe_hpp */
